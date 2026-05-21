import { Lead } from './types';

export const MOCK_SCENARIO_WELLNESS: Lead[] = [
  {
    id: '1',
    source: 'instagram',
    companyName: 'Zen Soul Yoga',
    website: 'zensoulyoga.es',
    socialUrl: 'instagram.com/zensoulyoga',
    location: 'Barcelona, España',
    decisionMaker: {
      name: 'Elena Rostova',
      role: 'Fundadora',
      email: 'elena@zensoulyoga.es',
      phone: '+34 600 123 456'
    },
    aiAnalysis: {
      summary: 'Estudio de yoga premium. Fuerte marca visual pero embudo de conversión roto en la web.',
      painPoints: ['Poca interacción en reels recientes', 'Sin captura de emails en la web'],
      generatedIcebreaker: 'Me encantó el ambiente que transmitís en vuestro último post sobre mindfulness.',
      fullMessage: "¡Hola Elena! 👋\n\nMe pasé por vuestro perfil de Instagram y me encantó la vibra que tenéis en Zen Soul Yoga, especialmente el último post sobre mindfulness. 🌱\n\nMe fijé en que tenéis una comunidad súper activa, pero echando un ojo a la web no vi una forma fácil de que esa gente se suscriba a vuestra newsletter. ¡Es una pena perder ese tráfico!\n\nNosotros ayudamos a estudios como el vuestro a automatizar esto para que no se escape ni un lead. ¿Te animas a ver un vídeo súper corto (5 min) de cómo funcionaría?\n\n¡Un abrazo!",
      fullAnalysis: '',
      psychologicalProfile: '',
      businessMoment: '',
      salesAngle: ''
    },
    status: 'ready'
  },
  {
    id: '2',
    source: 'instagram',
    companyName: 'Green Life Supplements',
    website: 'greenlife-shop.com',
    socialUrl: 'instagram.com/greenlife_supps',
    location: 'Madrid, España',
    decisionMaker: {
      name: 'Marc Soler',
      role: 'Director de Marketing',
      email: 'marc@greenlife-shop.com',
    },
    aiAnalysis: {
      summary: 'Marca D2C de suplementos veganos. Buen producto, pero estrategia de ads saturada.',
      painPoints: ['Fatiga de anuncios detectada', 'Competidores usan UGC mejor'],
      generatedIcebreaker: '¡Enhorabuena por el lanzamiento de la nueva línea de proteína vegana!',
      fullMessage: "¡Hola Marc! 🙌\n\nAcabo de ver el lanzamiento de vuestra nueva línea de proteína vegana, ¡el packaging se ve increíble! 🔥\n\nHe estado analizando el sector D2C y he visto que algunas marcas están consiguiendo resultados brutales usando un tipo de UGC que vosotros aún no estáis explotando. Creo que podría daros ese empujón extra.\n\nHe preparado un mini desglose de estas estrategias. ¿Te importa si te lo envío por aquí?\n\nSaludos,",
      fullAnalysis: '',
      psychologicalProfile: '',
      businessMoment: '',
      salesAngle: ''
    },
    status: 'enriched'
  }
];

export const MOCK_SCENARIO_CONSTRUCTION: Lead[] = [
  {
    id: '3',
    source: 'linkedin',
    companyName: 'Reformas Integrales Madrid',
    website: 'reformas-integrales-madrid.com',
    socialUrl: 'maps.google.com/?cid=123',
    location: 'Madrid, España',
    decisionMaker: {
      name: 'Jose García',
      role: 'Propietario',
      email: 'contacto@reformas-madrid.com',
      phone: '+34 912 345 678'
    },
    aiAnalysis: {
      summary: 'Empresa de reformas de lujo. Excelente reputación offline (Google Maps) pero imagen online anticuada.',
      painPoints: ['Reseñas de Google sin responder', 'Fotos de portafolio desactualizadas'],
      generatedIcebreaker: 'Impresionante ver esas 5 estrellas en Google Maps, ¡buen trabajo!',
      fullMessage: "¡Hola Jose! 👋\n\nEstaba buscando empresas de reformas top en Madrid y he visto vuestras reseñas de 5 estrellas. ¡Impresionante el nivel de satisfacción de vuestros clientes! ⭐\n\nLo único que me llamó la atención es que las fotos de la web se ven un pelín antiguas y no hacen justicia a la calidad que comentan en las reseñas. Sería una lástima perder proyectos de alto nivel por eso.\n\nNosotros nos encargamos de renovar portafolios web automáticamente para que luzcan tan bien como vuestras obras. ¿Te cuento mejor en una llamada rápida?\n\nUn saludo,",
      fullAnalysis: '',
      psychologicalProfile: '',
      businessMoment: '',
      salesAngle: ''
    },
    status: 'ready'
  },
  {
    id: '4',
    source: 'linkedin',
    companyName: 'Construcciones Pepe S.L.',
    website: 'construccionespepe.es',
    socialUrl: 'maps.google.com/?cid=456',
    location: 'Getafe, España',
    decisionMaker: {
      name: 'Pepe Rodriguez',
      role: 'Director',
      email: 'info@construccionespepe.es',
      phone: '+34 600 999 888'
    },
    aiAnalysis: {
      summary: 'Contratista general. Invisible en búsquedas locales clave.',
      painPoints: ['Poca visibilidad en SEO local', 'Web no adaptada a móviles'],
      generatedIcebreaker: 'Os encontré en la página 2 buscando "contratistas en Getafe".',
      fullMessage: "Hola Pepe,\n\nTe escribo porque busqué 'contratistas en Getafe' y vi que estáis en la página 2 de Google. 📉\n\nSeguramente estéis haciendo un gran trabajo, pero la competencia de la página 1 se está llevando casi todas las llamadas ahora mismo. \n\nPodemos solucionar esto con un par de ajustes en vuestra ficha de Maps. ¿Te puedo enviar un informe rápido mostrando exactamente qué falla?\n\nGracias,",
      fullAnalysis: '',
      psychologicalProfile: '',
      businessMoment: '',
      salesAngle: ''
    },
    status: 'scraped'
  }
];
