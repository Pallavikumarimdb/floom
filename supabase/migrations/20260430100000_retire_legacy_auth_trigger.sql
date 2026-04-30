-- The legacy trigger inserts profiles without ON CONFLICT and conflicts with
-- floom_on_auth_user_created during test/user signup.

drop trigger if exists on_auth_user_created on auth.users;
