# 🔴 SOLUCIÓN: Foreign Key Constraint Violation

## El Problema

Cuando intentas insertar un registro en `search_history`, falla con:
```
Key is not present in table "profiles"
insert or update on table "search_history" violates foreign key 
constraint "search_history_user_id_fkey"
```

**Causa:** Cuando el usuario se loguea en Supabase Auth, NO se crea automáticamente un registro en la tabla `profiles`. Así que cuando intentas insertar datos, falla la foreign key.

---

## ✅ SOLUCIÓN (5 minutos)

### 1. Ejecutar SQL - Triggers y RLS Fix

En **Supabase SQL Editor**:

1. Abre: https://app.supabase.com → biltmzurmhvgdprpekoa
2. SQL Editor → Nuevo Query
3. Copia TODA el contenido de: `supabase/fix_triggers_and_rls.sql`
4. Ejecuta (botón ▶️)

**Esto:**
- ✅ Crea un trigger que auto-genera el perfil cuando un usuario se registra
- ✅ Crea configuración por defecto cuando se crea un perfil
- ✅ Arregla las RLS policies para permitir inserts/updates

---

### 2. Verificar en Supabase que funciona

En **SQL Editor**, ejecuta:

```sql
-- Listar todos los triggers
SELECT trigger_name, event_object_table 
FROM information_schema.triggers 
WHERE trigger_schema = 'public';

-- Resultado esperado:
-- - on_auth_user_created  (en tabla auth.users)
-- - on_profile_created    (en tabla profiles)
```

---

## 🧪 Test Rápido

### A. En Supabase Authentication

1. Crea un nuevo usuario:
   - Email: `test2@apexengine.io`
   - Password: `Test123!@#`

2. Copia el UUID del usuario

### B. Verifica en SQL que se creó el perfil automáticamente

```sql
SELECT id, email, full_name FROM profiles 
WHERE email = 'test2@apexengine.io';

-- Debe retornar 1 fila (creada automáticamente por el trigger)
```

### C. Prueba en la app

1. Login con `test2@apexengine.io` / `Test123!@#`
2. Intenta hacer una búsqueda
3. Los datos se deberían guardar sin errores de FK

---

## 📊 Tabla de Cambios

| Antes | Después | Resultado |
|-------|---------|-----------|
| Usuario se loguea → NO hay perfil | Usuario se loguea → Trigger crea perfil | ✅ FK constraint respetado |
| RLS permite SELECT/UPDATE | RLS permite SELECT/UPDATE/**INSERT** | ✅ Puedo escribir datos |
| Trigger no existe | Trigger auto-crea config | ✅ Usuario listo para usar |

---

## 🔧 Si aún hay errores después de esto

1. **Error 400 en profiles query:**
   ```
   Check que exista la columna 'full_name' 
   (debería existir según schema)
   ```

2. **Error 409 en search_history:**
   ```
   Probablemente RLS policy mala
   Verifica que WHERE clause usa auth.uid()
   ```

3. **Error 406 en cualquier endpoint:**
   ```
   Verifica credentials en .env
   Asegúrate que VITE_SUPABASE_URL es correcto
   ```

---

## 📋 Checklist Final

- [ ] Ejecuté `fix_triggers_and_rls.sql`
- [ ] Verifiqué que los triggers existen en SQL
- [ ] Creé usuario test
- [ ] Verifiqué que profile se creó automáticamente
- [ ] Hice login en la app
- [ ] Probé una búsqueda
- [ ] Los datos se guardaron sin error

---

**Una vez completado, todo debe funcionar perfectamente.** 🚀
