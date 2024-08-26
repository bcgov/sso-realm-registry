This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

### Step 0: Running Keycloak for Realm Registy

For a convenient local development environment, there is a docker compose file in the [local-keycloak folder](../local-keycloak/) that runs 3 keycloak instances for the Realm Registries app to run against. This can be run using the usual docker compose commands:

```
docker-compose build
docker-compose up
```

Note that to connect to the local keycloak instances the following env must be set:

```
DEV_KC_URL=http://localhost:9080
DEV_KC_USERNAME=admin
DEV_KC_PASSWORD=admin
TEST_KC_URL=http://localhost:9081
TEST_KC_USERNAME=admin
TEST_KC_PASSWORD=admin
PROD_KC_URL=http://localhost:9082
PROD_KC_USERNAME=admin
PROD_KC_PASSWORD=admin
```

### Running the local Realm Registry app

In the app folder run:

Run `make local-setup`

Create the `.env` file from the `.env.example` file in the app folder.

The values can be found in the project's non-prod vault file. The local database creds are username "postgres", password is the local password for your database.

The CHES config can be changed. If you need to connect to the production CHES the config can be copied from the AWS dev environment variables for the sso-request lambda function.

Update the '<postgres_username>' value with a local postgres username in the `app/db/setup.sh` file. In the folder `app/db/` run:

```
pg_ctl start
./setup.sh
```

Then run the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.tsx`. The page auto-updates as you edit the file.

[API routes](https://nextjs.org/docs/api-routes/introduction) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `pages/api/hello.ts`.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/api-routes/introduction) instead of React pages.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

## Prisma

### npx prisma db pull

- Generates prisma schema by connecting to the existing database

### npx prisma generate

- Generate typescript types for the database objects
