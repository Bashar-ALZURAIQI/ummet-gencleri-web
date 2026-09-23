BEGIN;

CREATE OR REPLACE FUNCTION public.set_own_activity_enrollment(
  p_activity_id uuid,
  p_decision public.activity_decision,
  p_excuse_text text DEFAULT NULL
)
RETURNS public.activity_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_activity public.activities;
  v_existing public.activity_enrollments;
  v_result public.activity_enrollments;
  v_clean_excuse text := NULLIF(btrim(p_excuse_text), '');
  v_joining_count integer;
  v_balance integer;
  v_cycle integer;
  v_fee_active boolean;
  v_balance_changed boolean := false;
  v_is_executive boolean := false;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.executive_assignments AS assignment
      WHERE assignment.user_id = v_user_id
    ) INTO v_is_executive;
  END IF;

  IF v_user_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.profiles AS profile
       WHERE profile.id = v_user_id
         AND profile.status = 'active'
     )
     OR (NOT v_is_executive AND NOT (SELECT private.is_accepted_active_student(v_user_id))) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Only accepted active students or current executives may update activity enrollment';
  END IF;

  SELECT *
  INTO v_activity
  FROM public.activities
  WHERE id = p_activity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Activity not found';
  END IF;

  IF v_activity.evaluation_closed_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Activity evaluation is already closed';
  END IF;

  IF v_activity.deadline <= now() THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Activity enrollment is closed';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.activity_enrollments
  WHERE activity_id = p_activity_id
    AND student_id = v_user_id
  FOR UPDATE;

  IF v_existing.excuse_status IN ('ACCEPTED', 'PARTIAL', 'REJECTED') THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Final excuse review locks activity participation';
  END IF;

  IF p_decision = 'DECLINING'
     AND v_activity.type = 'MANDATORY'
     AND v_clean_excuse IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Mandatory activities require an excuse when declining';
  END IF;

  IF p_decision = 'JOINING' THEN
    IF v_activity.max_capacity IS NOT NULL THEN
      SELECT count(*)::integer
      INTO v_joining_count
      FROM public.activity_enrollments AS enrollment
      WHERE enrollment.activity_id = p_activity_id
        AND enrollment.student_id <> v_user_id
        AND enrollment.decision = 'JOINING';

      IF v_joining_count >= v_activity.max_capacity THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Activity capacity is full';
      END IF;
    END IF;
    v_clean_excuse := NULL;
  END IF;

  IF p_decision = 'IGNORED' THEN
    v_clean_excuse := NULL;
  END IF;

  IF NOT v_is_executive
     AND v_activity.type = 'PAID'
     AND p_decision = 'JOINING'
     AND COALESCE(v_existing.paid_fee_active, false) = false THEN
    SELECT profile.total_points
    INTO v_balance
    FROM public.profiles AS profile
    WHERE profile.id = v_user_id
    FOR UPDATE;

    IF COALESCE(v_balance, 0) < v_activity.points_value THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Student points are insufficient for this activity';
    END IF;

    v_cycle := COALESCE(v_existing.paid_charge_cycle, 0) + 1;
    INSERT INTO public.points_ledger (student_id, amount, reason, created_by, source_key)
    VALUES (
      v_user_id,
      -v_activity.points_value,
      'رسوم نشاط : ' || v_activity.title,
      v_user_id,
      'paid-join:' || p_activity_id || ':' || v_user_id || ':' || v_cycle
    )
    ON CONFLICT (source_key) DO NOTHING;
    v_balance_changed := FOUND;
    v_fee_active := true;
  ELSIF NOT v_is_executive
        AND v_activity.type = 'PAID'
        AND p_decision <> 'JOINING'
        AND COALESCE(v_existing.paid_fee_active, false) THEN
    v_cycle := v_existing.paid_charge_cycle;
    INSERT INTO public.points_ledger (student_id, amount, reason, created_by, source_key)
    VALUES (
      v_user_id,
      v_activity.points_value,
      'استرداد رسوم نشاط: ' || v_activity.title,
      v_user_id,
      'paid-refund:' || p_activity_id || ':' || v_user_id || ':' || v_cycle
    )
    ON CONFLICT (source_key) DO NOTHING;
    v_balance_changed := FOUND;
    v_fee_active := false;
  ELSE
    v_cycle := COALESCE(v_existing.paid_charge_cycle, 0);
    v_fee_active := CASE
      WHEN v_is_executive THEN COALESCE(v_existing.paid_fee_active, false)
      ELSE v_activity.type = 'PAID' AND p_decision = 'JOINING'
    END;
  END IF;

  INSERT INTO public.activity_enrollments (
    activity_id,
    student_id,
    decision,
    excuse_text,
    paid_charge_cycle,
    paid_fee_active
  ) VALUES (
    p_activity_id,
    v_user_id,
    p_decision,
    v_clean_excuse,
    v_cycle,
    v_fee_active
  )
  ON CONFLICT (activity_id, student_id) DO UPDATE
  SET decision = EXCLUDED.decision,
      excuse_text = EXCLUDED.excuse_text,
      paid_charge_cycle = EXCLUDED.paid_charge_cycle,
      paid_fee_active = EXCLUDED.paid_fee_active,
      attendance_status = CASE
        WHEN EXCLUDED.decision <> public.activity_enrollments.decision THEN NULL
        ELSE public.activity_enrollments.attendance_status
      END
  RETURNING * INTO v_result;

  IF v_balance_changed THEN
    PERFORM private.refresh_top_ten_state(true);
  END IF;
  RETURN v_result;
END;
$function$;

COMMIT;
