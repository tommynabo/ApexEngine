# 🔴 PROBLEMA CRÍTICO - Solución Rápida

## Los Errores Que Estás Viendo:

```
Failed to load resource: status 404
Failed to load resource: status 400
AuthApiError: Invalid login credentials
```

**Causa raíz:** ❌ **El Schema SQL NO fue ejecutado en Supabase**

Las tablas no existen. El sistema intenta escribir a tablas fantasma.

---

## ⚡ SOLUCIÓN (5 minutos)

### Paso 1: Ejecutar SQL Schema en Supabase

**Ir a:**
1. https://app.supabase.com
2. Proyecto: `biltmzurmhvgdprpekoa`
3. SQL Editor (lado izquierdo)
4. Nuevo Query

**Copiar TODO el contenido de:**
`/Users/tomas/Downloads/DOCUMENTOS/ApexEngine/supabase/apex_engine_schema.sql`

**Pegar en Supabase SQL Editor**

**Ejecutar botón verde (▶️)**

✅ Debe crear estas 10 tablas:
```
profiles
search_criteria
search_history
leads
message_templates
daily_contact_log
system_prompts
deduplication_log
api_usage_tracking
user_configuration
```

---

### Paso 2: Crear Usuario Test en Supabase

En **Authentication → Users**, crear usuario:
```
Email: test@apexengine.io
Password: Test123!@#
```

Copia el UUID del usuario (para después)

---

### Paso 3: Ejecutar este SQL en Supabase (para ese usuario)

En SQL Editor:

```sql
-- Reemplazar UUID_AQUI con el UUID del usuario que creaste
INSERT INTO profiles (id, email, full_name)
VALUES ('UUID_AQUI', 'test@apexengine.io', 'Marcos Test');

INSERT INTO user_configuration (user_id, daily_limit_contacts, dark_mode)
VALUES ('UUID_AQUI', 25, true);
```

---

### Paso 4: Limpiar el código (YA HECHO ✅)

He corregido App.tsx:
- ✅ Tabla `search_results_diego` → `search_history`
- ✅ Estructura de datos sincronizada
- ✅ Mensajes de error mejorados
- ✅ Tailwind CDN removido de index.html

**Git:**
```bash
git add -A && git commit -m "fix: Corregir referencias a tabla vieja y estructura de datos" && git push
```

---

### Paso 5: Reiniciar en Local

```bash
npm run dev
```

**Login:**
- Email: `test@apexengine.io`
- Password: `Test123!@#`

---

## ✅ Verificación

Una vez hecho esto, deberías ver:

```
✅ Login successful
✅ Dashboard carga
✅ Puedes iniciar búsqueda (aunque Apify fallará si no tienes créditos)
✅ Los resultados se guardan en BD
✅ El historial se carga
```

---

## 🚀 Quick Checklist

- [ ] Ejecuté el archivo SQL en Supabase
- [ ] Creé usuario test en Auth
- [ ] Creé perfil para ese usuario
- [ ] Hice git push de los cambios
- [ ] Corrí `npm run dev`
- [ ] Hice login con email/password

---

## Nota Importante

Sin ejecutar el SQL, **nada funcionará**. Las tablas no existen. Todos los 404 y 400 son porque la base de datos está vacía.

**Este es el paso más crítico.**
