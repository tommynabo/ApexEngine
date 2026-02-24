import { ProjectConfig } from '../lib/types';

export const PROJECT_CONFIG: ProjectConfig = {
    clientId: 'marco_inmobiliarias_2025',
    clientName: 'Marcos - Inmobiliarias España',
    primaryColor: 'hsl(210, 100%, 50%)', // Dark blue for official look
    targets: {
        icp: 'Dueños y Directivos de Inmobiliarias (CEO, Fundador, Socio)',
        locations: ['España'], // National scope
    },
    enabledPlatforms: ['linkedin'],
    searchSettings: {
        defaultDepth: 10,
        defaultMode: 'fast'
    },
    // New specific settings for Marcos
    immobiliariasConfig: {
        targetIndustries: ['Real Estate', 'Servicios Inmobiliarios'],
        companySizes: ['1-10', '11-50', '51-200'],
        requiredTitles: [
            'CEO', 'Fundador', 'Socio Fundador', 'Owner', 
            'Propietario', 'Director General', 'Gerente', 'Managing Director'
        ],
        excludeTitles: [
            'Agente', 'Asesor', 'Comercial', 'Consultor', 'Franquiciado'
        ],
        dailyContactLimit: 25, // Marcos' manual limit
        enableNPLDetection: true,
        batchScrapingStrategy: 'provincial' // or 'alphabetical'
    }
};
