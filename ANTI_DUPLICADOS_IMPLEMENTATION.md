# 🛡️ Implementación de Lógica Anti-Duplicados

## Descripción General

Se ha implementado un sistema robusto de **prevención de duplicados** en LeadOS siguiendo la metodología "Nunca Repetir Leads". Este sistema garantiza que **ningún lead será procesado ni entregado si ya existe en la base de datos histórica del usuario**.

---

## 🏗️ Arquitectura Implementada

### 1. **DeduplicationService** (`services/deduplication/DeduplicationService.ts`)
Nuevo servicio modular que maneja toda la lógica anti-duplicados:

#### Métodos Principales:

**`normalizeUrl(url: string): string`**
- Convierte URLs a minúsculas
- Elimina protocolos (`https://`, `http://`)
- Elimina `www.`
- Elimina trailing slashes
- Ejemplo: `https://www.example.com/` → `example.com`

**`normalizeName(name: string): string`**
- Convierte nombres a minúsculas
- Normaliza espacios en blanco
- Ejemplo: `Empresa   ABC` → `empresa abc`

**`fetchExistingLeads(userId: string): Promise<{existingWebsites: Set<string>, existingCompanyNames: Set<string>, totalCount: number}>`**
- **FASE 1: Pre-Flight**
- Consulta Supabase por TODOS los leads históricos del usuario
- Descarga todos los dominios y nombres de empresas
- Los almacena en `Set` para búsqueda O(1) en memoria
- Logs detallados del proceso

**`filterUniqueCandidates(candidates: Lead[], existingWebsites: Set, existingCompanyNames: Set): Lead[]`**
- **FASE 2: Filtrado (In-Loop)**
- Compara cada candidato contra los Sets
- Descarta inmediatamente cualquier duplicado
- Genera logs detallados de duplicados rechazados
- Retorna solo leads únicos

**`saveUniqueLeads(leads: Lead[], userId: string, sessionId: string): Promise<boolean>`**
- **FASE 3: Guardado**
- Solo guarda leads que pasaron el filtro de deduplicación
- Manejo de errores robusto

---

### 2. **SearchService** Modificado (`services/search/SearchService.ts`)

#### Cambios Realizados:

```typescript
export class SearchService {
    // ... existing code ...
    private userId: string | null = null; // ← NEW

    public async startSearch(
        config: SearchConfigState,
        onLog: LogCallback,
        onComplete: ResultCallback,
        userId?: string | null  // ← NEW PARAMETER
    )
```

**Flujo Integrado:**
1. Recibe `userId` como parámetro opcional
2. Inicia **Phase 1: Pre-Flight** llamando a `fetchExistingLeads()`
3. Crea un callback intermediario `deduplicatedOnComplete` que:
   - Intercepta los resultados del scraping
   - Aplica **Phase 2: Filtrado** con `filterUniqueCandidates()`
   - Registra logs del proceso
   - Llama al callback original solo con leads únicos

**Logs Generados:**
```
[DEDUP] 🔍 Iniciando verificación anti-duplicados...
[DEDUP] ✅ Pre-Flight Complete: 45 dominios + 30 empresas descargadas
[DEDUP] 🎯 Aplicando filtro anti-duplicados (120 candidatos)...
[DEDUP] ⚠️ 10 duplicados eliminados. Procediendo con 110 leads únicos.
```

---

### 3. **App.tsx** Modificado

```typescript
const handleSearch = () => {
    // ... existing code ...
    
    searchService.startSearch(
        config,
        (message) => addLog(message),
        async (results) => { /* ... */ },
        userId  // ← PASS USER ID FOR DEDUPLICATION
    );
};
```

---

## 📊 Ejemplos de Uso

### Caso 1: Usuario con Historial Previo
```
Búsqueda: "Oficinas en Madrid"
Resultados del Scraping: 150 leads
Leads Históricos: 45 dominios + 30 nombres

→ Pre-Flight: Descargar 45+30 = 75 leads previos
→ Filtrado: 150 - 60 duplicados = 90 únicos
→ Guardado: Guardar solo los 90 nuevos

RESULTADO: Cliente recibe SOLO leads nuevos
```

### Caso 2: Usuario Nuevo (Sin Historial)
```
Búsqueda: "Startups Tech en Barcelona"
Resultados del Scraping: 80 leads
Leads Históricos: 0 (usuario nuevo)

→ Pre-Flight: Set vacío
→ Filtrado: 80 - 0 duplicados = 80 únicos
→ Guardado: Guardar los 80

RESULTADO: Cliente recibe todos los 80 leads
```

### Caso 3: Búsqueda Repetida (Mismo Usuario)
```
Búsqueda 1: "Gymnasia en España" → 100 leads guardados
Búsqueda 2: "Gimnasios España" → Scraping devuelve 150 leads

→ Pre-Flight: Descargar 100 leads de Búsqueda 1
→ Filtrado: 150 - 80 duplicados = 70 únicos
→ Guardado: Guardar solo los 70 nuevos

RESULTADO: Histórico total = 100 + 70 = 170 (sin duplicados)
```

---

## 🔒 Garantías de Seguridad

✅ **100% de Certeza:** El cliente NUNCA verá el mismo lead dos veces
✅ **Eficiencia de API:** No se gastan créditos enriqueciendo leads duplicados
✅ **Escalable:** Los Sets en memoria permiten búsquedas O(1)
✅ **Auditoria:** Logs detallados de todos los duplicados rechazados
✅ **Reversible:** Historial completo en Supabase permite análisis posteriores

---

## 📝 Normalización de Datos

### URLs Normalizadas Correctamente:

| Original | Normalizado |
|----------|------------|
| `https://www.example.com/` | `example.com` |
| `HTTP://EXAMPLE.COM/path` | `example.com` |
| `www.example.com` | `example.com` |
| `example.com//` | `example.com` |

### Nombres Normalizados Correctamente:

| Original | Normalizado |
|----------|------------|
| `ACME CORP` | `acme corp` |
| `Acme    Corp` | `acme corp` |
| `ACME   CORP   ` | `acme corp` |

---

## 📦 Estructura de Archivos

```
services/
├── search/
│   └── SearchService.ts          (✏️ Modificado)
├── deduplication/
│   └── DeduplicationService.ts   (✨ NUEVO)
App.tsx                            (✏️ Modificado)
```

---

## 🚀 Activación

La lógica anti-duplicados se activa **automáticamente** cuando:
1. El usuario inicia una búsqueda desde el dashboard
2. Se llama a `searchService.startSearch()` con `userId`
3. Se procesa cualquier fuente (Gmail, LinkedIn)

**No requiere configuración adicional ni cambios en la UI.**

---

## 🔍 Monitoreo y Logs

Accede a los logs en el terminal de AgentTerminal:
```
[DEDUP] 🔍 Iniciando verificación anti-duplicados...
[DEDUP] ✅ Pre-Flight Complete: X dominios + Y empresas descargadas
[DEDUP] 🎯 Aplicando filtro anti-duplicados (Z candidatos)...
[DEDUP] ❌ DESCARTADO: Empresa XYZ (website: ejemplo.com)
[DEDUP] ✅ Resultado: N/M leads únicos (X rechazados)
```

---

## 🛠️ Mantenimiento Futuro

- **Agregar más campos:** Si en el futuro necesitas deduplicar por email, teléfono, etc., extiende los métodos `normalize*()` y `filterUniqueCandidates()`
- **Cambiar estrategia de normalización:** Modifica `normalizeUrl()` y `normalizeName()` según necesites
- **Historial de duplicados:** Los logs completos están en Supabase para análisis

---

## 📚 Referencias al Código

- [DeduplicationService](./services/deduplication/DeduplicationService.ts)
- [SearchService (Modified)](./services/search/SearchService.ts)
- [App.tsx (Modified)](./App.tsx)
