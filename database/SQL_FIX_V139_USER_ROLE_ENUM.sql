-- V139 user_role enum compatibility fix
-- Use this instead of the previous V139 file if your public.users.role column is an enum.
-- It does not alter users.role / project_users.role constraints.
-- Workflow roles are stored in approval_matrix_steps.role_name as text and resolved to real users/emails.

-- The complete fixed migration is in:
-- database/SUPABASE_V139_CERTIFICATE_RELEASE_USERS_EMAILS.sql
