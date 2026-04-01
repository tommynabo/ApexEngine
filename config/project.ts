import { ProjectConfig } from '../lib/types';

export const PROJECT_CONFIG: ProjectConfig = {
    clientId: 'apex_engine_global',
    clientName: 'Apex Engine',
    primaryColor: 'hsl(210, 100%, 50%)', // Dark blue for official look
    targets: {
        icp: 'Dueños y Directivos de empresas B2B de servicios (CEO, Fundador, Socio, COO)',
        locations: ['España'], // National scope
    },
    enabledPlatforms: ['linkedin'],
    searchSettings: {
        defaultDepth: 10,
        defaultMode: 'fast'
    },
    // New specific settings
    apexEngineConfig: {
        targetIndustries: ['Agencias de Marketing B2B', 'Consultoras de Negocio', 'Empresas de Mantenimiento Industrial'],
        companySizes: ['1-10', '11-50', '51-200'],
        requiredTitles: [
            'CEO', 'Fundador', 'Socio', 'COO', 'Owner',
            'Propietario', 'Director General', 'Gerente', 'Managing Director'
        ],
        excludeTitles: [
            'Agente', 'Asesor', 'Comercial', 'Consultor', 'Franquiciado'
        ],
        dailyContactLimit: 25, 
        enableNPLDetection: true,
        batchScrapingStrategy: 'provincial' // or 'alphabetical'
    }
};
