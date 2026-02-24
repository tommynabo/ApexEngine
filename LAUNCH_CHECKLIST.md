# ⚡ ApexEngine - Quick Implementation Guide (Wednesday)

**Timeline:** 24 Febrero 2025  
**Goal:** Sistema listo para Marcos

---

## ✅ Checklist Pre-Launch

### 1️⃣ **Supabase Schema** (5 min)
- [ ] Acceder a https://app.supabase.com
- [ ] Entrar al proyecto `biltmzurmhvgdprpekoa`
- [ ] SQL Editor → Pegar contenido de `supabase/apex_engine_schema.sql`
- [ ] Ejecutar SQL
- [ ] Verificar que se crean 10 tablas
- [ ] Verificar RLS policies (Must return 10 row security policies)

```bash
# Verificación: Listar tablas
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

**Expected 10 tables:**
✅ profiles  
✅ search_criteria  
✅ search_history  
✅ leads  
✅ message_templates  
✅ daily_contact_log  
✅ system_prompts  
✅ deduplication_log  
✅ api_usage_tracking  
✅ user_configuration  

---

### 2️⃣ **Variables de Entorno** (2 min)
Verificar que `.env` tiene todas las keys:

```bash
cat .env | grep -E "VITE_SUPABASE|VITE_OPENAI|VITE_APIFY"
```

**Expected Output:**
```
VITE_SUPABASE_URL=https://biltmzurmhvgdprpekoa.supabase.co ✅
VITE_SUPABASE_ANON_KEY=eyJhbGc... ✅
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc... ✅
VITE_OPENAI_API_KEY=sk-proj-... ✅
VITE_APIFY_API_TOKEN=apify_api_... ✅
```

---

### 3️⃣ **Compilación** (10 min)
```bash
npm install
npm run build
```

**Si hay errores TypeScript:**
```bash
npm run build 2>&1 | grep -i error
```

**Errores comunes esperados:** NINGUNO  
(Si hay, revisar que LeadsCards.tsx esté en lugar correcto)

---

### 4️⃣ **Test en Local** (5 min)
```bash
npm run dev
```

Abrir: http://localhost:5173

**Verificar:**
- [ ] Login page aparece
- [ ] No hay errores en console (F12)
- [ ] Botón de búsqueda es no clickeable (correcto, sin API key de Apify real)

---

### 5️⃣ **Database Test** (5 min)

En Supabase SQL Editor:
```sql
-- Verificar que RLS está activo
SELECT tablename, rowlevel FROM pg_tables 
WHERE tablename IN ('leads', 'profiles', 'search_history')
AND schemaname = 'public';
-- Expected: All TRUE
```

```sql
-- Crear usuario de test
INSERT INTO auth.users (email, phone, email_verified_at) 
VALUES ('marcos@test.com', '+34600000000', now());

-- Crear su perfil
INSERT INTO profiles (id, email, full_name)
SELECT id, email, 'Marcos Test' FROM auth.users 
WHERE email = 'marcos@test.com';
```

---

### 6️⃣ **GitHub Verification** (2 min)
```bash
git log --oneline | head -5
```

Expected:
```
abc1234 🚀 ApexEngine v1.0 - Reestructuración para Marcos...
```

Verificar en https://github.com/tommynabo/ApexEngine
- [ ] Repository visible
- [ ] Commit en main

---

## 🎯 Configuración Específica Para Marcos

### Inmobiliarias España - Criterios Finales

```typescript
// config/project.ts - YA CONFIGURADO ✅
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
  dailyContactLimit: 25,
  enableNPLDetection: true,
  batchScrapingStrategy: 'provincial'
}
```

---

## 🚀 Flujo De Operación (Para Demo si es necesario)

### Día 1 de Marcos (Workflow)

1. **Abre el dashboard** (Login con credenciales de Supabase)

2. **Ve los leads en tarjetas:**
   ```
   ┌─────────────────────────────────────┐
   │ Contacto 1 de 50 (2% completado)   │
   │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
   │                                     │
   │ Juan García                         │
   │ CEO @ García Inmobiliarias          │
   │ 📍 Madrid                           │
   │                                     │
   │ Mensaje A (Automatización):         │
   │ "Hola Juan, he visto que gestio... │ [📋 Copiar]
   │                                     │
   │ Mensaje B (NPL):                    │
   │ "Juan, tu cartera inmobiliaria..." │ [📋 Copiar]
   │                                     │
   │ [✅ Contactado]  [✕]                │
   └─────────────────────────────────────┘
   ```

3. **Copia uno de los mensajes**

4. **Va a LinkedIn, pega, envía invitación**

5. **Regresa a la app, marca "✅ Contactado"**
   → Siguiente tarjeta aparece

6. **Repite hasta 25 contactos/día**

---

## 📊 Métricas A Monitorizar

### Daily KPIs (Para Marcos)

```
┌──────────────────┬─────────┬──────┐
│ Métrica          │ Hoy     │ Meta │
├──────────────────┼─────────┼──────┤
│ Contactados      │ 25/25   │ 25   │ ✅
│ Descartados      │ 5       │ <10  │ ✅
│ En Espera (Ready)│ 45      │ 50+  │ ✅
│ Respuestas       │ 0       │ 1-3  │ 📊
│ Tasa Conversión  │ 0%      │ 2-5% │ 📊
└──────────────────┴─────────┴──────┘
```

Viewable en dashboard (coming in v1.1)

---

## 🔧 Troubleshooting

### Error: "SUPABASE_URL is undefined"
**Causa:** `.env` no se cargó bien
**Solución:**
```bash
cat .env | head -5
# Debe mostrar: VITE_SUPABASE_URL=https://...
```

### Error: "OpenAI API key invalid"
**Causa:** Key expirada o incorrecta
**Solución:**
```bash
echo $VITE_OPENAI_API_KEY
# Verificar que comience con: sk-proj-
```

### Error: "relation 'leads' does not exist"
**Causa:** Schema no se ejecutó correctamente
**Solución:**
1. Ir a Supabase SQL Editor
2. Borrar todas las tablas (o crear DB nueva)
3. Ejecutar `supabase/apex_engine_schema.sql` completo

### Componente LeadsCards no aparece
**Causa:** Import error
**Solución:**
```bash
ls -la components/LeadsCards.tsx
# Debe existir
grep -n "import.*LeadsCards" App.tsx
# Debe tener el import
```

---

## 📱 URLs Importantes

| Recurso | URL |
|---------|-----|
| **Supabase** | https://app.supabase.com → biltmzurmhvgdprpekoa |
| **GitHub** | https://github.com/tommynabo/ApexEngine |
| **OpenAI** | https://platform.openai.com/account/api-keys |
| **Apify** | https://console.apify.com |
| **Local Dev** | http://localhost:5173 |

---

## ✨ Novedades Esta Versión

| Feature | Status | Impact |
|---------|--------|--------|
| LeadsCards UI | ✅ Nuevo | 📱 Workflow más rápido |
| 2 Mensajes (A+B) | ✅ Nuevo | 💬 Opciones personalizadas |
| Daily Tracking | ✅ Nuevo | 📊 Monitoreo de 25/día |
| NPL Detection | ✅ Nuevo | 🎯 Nicho adicional |
| Supabase v2 | ✅ Nuevo | 🗄️ DB limpia |
| Search Motor | ♻️ Intacto | 🔍 Funciona igual |

---

## 🎯 Post-Launch (v1.1)

- [ ] Dashboard de métricas
- [ ] Calendar view de contactos
- [ ] Auto-scheduling (En lugar de manual 25/día)
- [ ] LinkedIn API integration (Si presupuesto lo permite)
- [ ] Email de follow-up automático
- [ ] Analytics de reply rates

---

## 📞 Contacto Rápido

**Si hay problemas:**
1. Verificar console (F12)
2. Revisar `.env`
3. Revisar logs de Supabase
4. Hacer push a GitHub con `[DEBUG]`
5. Contactar al equipo técnico

---

**Launcher:** Wednesday 24th Feb 2025

**Desarrollado para:** Marcos 🚀

**Proyecto:** ApexEngine - Inmobiliarias LinkedIn Scraper España 🇪🇸
