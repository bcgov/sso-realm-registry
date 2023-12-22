CREATE TABLE IF NOT EXISTS
    public.rosters (
        id serial NOT NULL,
        realm VARCHAR(1000),
        product_name VARCHAR(1000),
        product_owner_email VARCHAR(1000),
        product_owner_idir_userid VARCHAR(1000),
        technical_contact_email VARCHAR(1000),
        technical_contact_idir_userid VARCHAR(1000),
        second_technical_contact_email VARCHAR(1000),
        second_technical_contact_idir_userid VARCHAR(1000),
        rc_channel TEXT,
        ministry VARCHAR(1000),
        division VARCHAR(1000),
        branch VARCHAR(1000),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        material_to_send TEXT,
        rc_channel_owned_by VARCHAR(1000),
        PRIMARY KEY (id)
    );

CREATE TABLE IF NOT EXISTS
    public.surveys_1 (
        idir_userid VARCHAR(1000),
        contact_email VARCHAR(1000),
        willing_to_move VARCHAR(1000),
        when_to_move VARCHAR(1000),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (idir_userid)
    );

CREATE UNIQUE INDEX IF NOT EXISTS realm_unique_index ON rosters (realm);

ALTER TABLE public.rosters
ADD COLUMN IF NOT EXISTS environments TEXT[];

ALTER TABLE public.rosters
ADD COLUMN IF NOT EXISTS purpose TEXT;

ALTER TABLE public.rosters
ADD COLUMN IF NOT EXISTS primary_end_users TEXT[];

ALTER TABLE public.rosters
ADD COLUMN IF NOT EXISTS preferred_admin_login_method VARCHAR(25);

ALTER TABLE public.rosters
ADD COLUMN IF NOT EXISTS approved BOOLEAN;

ALTER TABLE public.rosters
ADD COLUMN IF NOT EXISTS status VARCHAR(50);

ALTER TABLE public.rosters
ADD COLUMN IF NOT EXISTS requestor VARCHAR(100);

ALTER TABLE public.rosters
ADD COLUMN IF NOT EXISTS last_updated_by VARCHAR(50);

ALTER TABLE public.rosters
ADD COLUMN IF NOT EXISTS pr_number INTEGER;

ALTER TABLE public.rosters
ADD COLUMN IF NOT EXISTS archived BOOLEAN default FALSE;

CREATE TABLE IF NOT EXISTS
    public.events (
        id serial NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        realm_id INTEGER,
        event_code VARCHAR(100),
        idir_user_id VARCHAR(100),
        details jsonb,
        PRIMARY KEY (id),
        CONSTRAINT fk_realm_id FOREIGN KEY (realm_id) REFERENCES public.rosters (id) ON DELETE CASCADE
    )
