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
    );

 ALTER TABLE public.rosters
   DROP COLUMN IF EXISTS rc_channel,
   DROP COLUMN IF EXISTS rc_channel_owned_by;

CREATE TABLE IF NOT EXISTS
    public.users (
        id serial NOT NULL,
        guid VARCHAR(1000),
        idir_username VARCHAR(1000) NOT NULL,
        email VARCHAR(1000),
        display_name VARCHAR(1000),
        resolved_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
    );

-- guid is the identity key, but is nullable so that contacts who no longer exist in
-- the directory can still be represented. Postgres allows multiple NULLs in a unique
-- column, so the username index is what dedupes those unresolved rows.
CREATE UNIQUE INDEX IF NOT EXISTS users_guid_unique_index ON public.users (guid);

CREATE UNIQUE INDEX IF NOT EXISTS users_idir_username_unique_index ON public.users (LOWER(idir_username));

CREATE TABLE IF NOT EXISTS
    public.users_rosters (
        id serial NOT NULL,
        user_id INTEGER NOT NULL,
        roster_id INTEGER NOT NULL,
        role VARCHAR(50) NOT NULL,
        synced_at TIMESTAMP WITH TIME ZONE,
        removed_at TIMESTAMP WITH TIME ZONE,
        revoked_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT fk_users_rosters_user_id FOREIGN KEY (user_id) REFERENCES public.users (id),
        CONSTRAINT fk_users_rosters_roster_id FOREIGN KEY (roster_id) REFERENCES public.rosters (id) ON DELETE CASCADE,
        CONSTRAINT users_rosters_role_check CHECK (
            role IN ('product_owner', 'technical_lead', 'additional')
        )
    );

-- Removed rows are kept as tombstones, so uniqueness only applies to live membership.
CREATE UNIQUE INDEX IF NOT EXISTS users_rosters_member_unique_index ON public.users_rosters (roster_id, user_id) WHERE removed_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_rosters_product_owner_unique_index ON public.users_rosters (roster_id) WHERE role = 'product_owner' AND removed_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_rosters_technical_lead_unique_index ON public.users_rosters (roster_id) WHERE role = 'technical_lead' AND removed_at IS NULL;

CREATE INDEX IF NOT EXISTS users_rosters_roster_id_index ON public.users_rosters (roster_id);

CREATE INDEX IF NOT EXISTS users_rosters_user_id_index ON public.users_rosters (user_id);
