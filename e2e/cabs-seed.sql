-- The demo business the dev sign-in opens (lib/auth/dev-bypass.ts), set up as a cab operator on the Starter plan with a trial.
INSERT INTO dealers (slug, display_name, industry, plan, city, phone, theme, trial_ends_at)
VALUES ('sri-murugan', 'Anna Travels', 'cabs', 'starter', 'Chennai', '+919876543210',
        '{"primary":"#1d4ed8","primaryForeground":"#ffffff","accent":"#f59e0b","radius":"md"}', now() + interval '20 days')
ON CONFLICT (slug) DO UPDATE SET industry = 'cabs', plan = 'starter', trial_ends_at = now() + interval '20 days';
