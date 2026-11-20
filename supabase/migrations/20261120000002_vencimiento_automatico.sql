-- OPCIONAL (recomendado): vence solicitudes automáticamente cada 5 minutos.
-- En Supabase: Database > Extensions > activar "pg_cron", luego ejecutar este archivo.
-- Sin esto la app igual funciona: marca vencidas al abrir Explorar y bloquea
-- aceptar/entregar fuera de plazo en el servidor.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'mtigo-vencimientos';
select cron.schedule('mtigo-vencimientos', '*/5 * * * *', $$select public.expire_overdue_requests()$$);
