\set ON_ERROR_STOP on
begin;
\ir secure_upload_contract.sql
\ir daily_maintenance_contract.sql
\ir product_readiness_hardening_contract.sql
rollback;
