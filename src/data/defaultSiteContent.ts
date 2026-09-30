import type { SiteContent } from '../context/AppContext';

export const DEFAULT_SITE_CONTENT: SiteContent = {
    brand: { name: 'اتحاد شباب الأمة', nameTr: 'Ummet Gençleri Birliği', logoIcon: 'Users' },
    footer: {
      phone: '+90 212 555 00 00',
      email: 'info@ummet.org',
      address: 'إسطنبول، تركيا - حي الفاتح',
      copyright: 'اتحاد شباب الأمة - جميع الحقوق محفوظة.',
      social: { facebook: 'https://facebook.com/ummet', twitter: 'https://twitter.com/ummet', instagram: 'https://instagram.com/ummet', youtube: 'https://youtube.com/@ummet' },
    },
    hero: {
      badge: 'نُمكّن الشباب، نبني المستقبل',
      title: 'اتحاد شباب الأمة',
      subtitle: 'نحو جيلٍ واعٍ ومسؤول',
      description: 'اتحاد شبابي يجمع طلاب الجامعات تحت مظلة واحدة، لتعزيز الهوية، وتنمية المهارات، وبناء قادة الغد عبر برامج تثقيفية وتدريبية وتطوعية متكاملة.',
      primaryBtn: 'تصفح البرامج',
      secondaryBtn: 'تعرّف على الاتحاد',
      tertiaryBtn: 'الهيئة التنفيذية',
      image: '',
      badge1: { value: '12', label: 'جائزة تكريم', icon: 'Award' },
      badge2: { value: '+38%', label: 'نمو سنوي', icon: 'TrendingUp' },
    },
    stats: [
      { value: 1248, label: 'عضو مسجل', icon: 'Users' },
      { value: 86, label: 'فعالية منظمة', icon: 'CalendarDays' },
      { value: 24, label: 'جامعة شريكة', icon: 'GraduationCap' },
      { value: 540, label: 'متطوع نشط', icon: 'HeartHandshake' },
    ],
    about: {
      badge: 'من نحن',
      title: 'رسالتنا: بناء جيلٍ يحمل همّ أمته',
      description: 'نؤمن أن الشباب هم عماد المستقبل وصناع التغيير. لذلك نعمل على تأهيل الطلاب أكاديميًا ومهاريًا، وتعزيز انتمائهم لأمتهم، عبر بيئة شبابية محفّزة وبرامج متنوعة تجمع بين العلم والعمل والقيم.',
      image: 'https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/gallery/site/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/793f1e54-2550-4a05-82cc-75ebf0957f93.jpg',
      imageBadge: { value: '+1200', label: 'طالب استفاد من برامجنا هذا العام' },
      features: [
        { icon: 'Target', title: 'رؤية واضحة', desc: 'إعداد قادة شباب مؤثرين.' },
        { icon: 'BookOpen', title: 'تعليم مستمر', desc: 'برامج تدريبية وتثقيفية.' },
        { icon: 'HeartHandshake', title: 'عمل تطوعي', desc: 'خدمة المجتمع والأمة.' },
        { icon: 'Sparkles', title: 'إبداع وابتكار', desc: 'مساحات للمبادرات الشبابية.' },
      ],
    },
    boardPreview: {
      title: 'الهيئة التنفيذية',
      subtitle: 'الهيكل التنظيمي',
      description: 'فريق قيادي متكامل يضم الرئاسة ونائب الرئيس وخمس لجان متخصصة.',
      memberIds: ['presidency', 'vice-presidency', 'media', 'academic'],
    },
  };

