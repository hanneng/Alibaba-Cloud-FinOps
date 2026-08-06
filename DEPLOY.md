# Deploy FinOps to Alibaba Cloud

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Backend    │────▶│   Database   │
│  (OSS + CDN) │     │ (SAE/Docker) │     │ (RDS PG)     │
│  Port 443    │     │  Port 3000   │     │  Port 5432   │
└──────────────┘     └──────────────┘     └──────────────┘
```

## Prerequisites

- [Alibaba Cloud CLI (aliyun)](https://www.alibabacloud.com/help/en/alibaba-cloud-cli/latest)
- [Docker](https://docs.docker.com/get-docker/) installed locally
- An Alibaba Cloud account with access to: OSS, ACR, SAE, RDS
- `aliyun configure` completed with your AccessKey

---

## Step 1: Create RDS PostgreSQL Instance

### Via Console
1. Go to **RDS Console** → Create Instance
2. Select: **PostgreSQL 16**, **Basic Edition**, **1 Core 2GB** (or higher)
3. Set the database name to `finops`
4. Note the **internal endpoint** (e.g., `pgm-xxx.pg.rds.aliyuncs.com`)
5. Set a secure password for the `finops` user

### Via CLI
```bash
aliyun rds CreateDBInstance \
  --RegionId cn-hangzhou \
  --Engine PostgreSQL \
  --EngineVersion 16.0 \
  --DBInstanceClass pg.n2.small.1 \
  --DBInstanceStorage 20 \
  --DBInstanceNetType Intranet \
  --SecurityIPList 0.0.0.0/0 \
  --PayType Postpaid

# Create database
aliyun rds CreateDatabase \
  --DBInstanceId <your-instance-id> \
  --DBName finops \
  --CharacterSetName UTF8

# Create account
aliyun rds CreateAccount \
  --DBInstanceId <your-instance-id> \
  --AccountName finops \
  --AccountPassword '<your-password>' \
  --AccountType Normal
```

### Initialize Schema
```bash
# Set your RDS connection string
export DATABASE_URL="postgresql://finops:<password>@<rds-endpoint>:5432/finops"

# Run schema initialization
cd server
npm run db:init
```

---

## Step 2: Push Backend Image to ACR (Alibaba Container Registry)

### Create ACR Namespace and Repository
```bash
# Login to ACR
aliyun cr GetAuthorizationToken --InstanceId <acr-instance-id>
docker login --username=<your-username> registry.cn-hangzhou.aliyuncs.com

# Create namespace (one-time)
aliyun cr CreateNamespace \
  --InstanceId <acr-instance-id> \
  --NamespaceName finops
```

### Build and Push Backend Image
```bash
# Build the API image
docker build -t finops-api:latest -f server/Dockerfile .

# Tag for ACR
docker tag finops-api:latest registry.cn-hangzhou.aliyuncs.com/finops/api:latest

# Push
docker push registry.cn-hangzhou.aliyuncs.com/finops/api:latest
```

---

## Step 3: Deploy Backend to SAE (Serverless App Engine)

### Via Console
1. Go to **SAE Console** → Create Application
2. Select **Image** deployment
3. Use image: `registry.cn-hangzhou.aliyuncs.com/finops/api:latest`
4. Configure:
   - **CPU**: 1 Core
   - **Memory**: 2 GB
   - **Instances**: 1 (min) / 3 (max)
   - **Port**: 3000
5. Set environment variables:
   - `DATABASE_URL`: `postgresql://finops:<password>@<rds-internal-endpoint>:5432/finops`
   - `PORT`: `3000`
   - `NODE_ENV`: `production`
6. Enable **Public Access** (SLB) and note the public URL

### Via CLI
```bash
aliyun sae CreateApplication \
  --AppName finops-api \
  --NamespaceId <namespace-id> \
  --PackageType Image \
  --ImageUrl registry.cn-hangzhou.aliyuncs.com/finops/api:latest \
  --Cpu 1000 \
  --Memory 2048 \
  --MinReadyInstances 1 \
  --Port 3000 \
  --Envs '[{"name":"DATABASE_URL","value":"postgresql://finops:<password>@<rds-endpoint>:5432/finops"},{"name":"PORT","value":"3000"},{"name":"NODE_ENV","value":"production"}]' \
  --EnableInternetAccess true
```

Note the **public endpoint URL** (e.g., `http://<slb-ip>:3000`).

---

## Step 4: Build and Deploy Frontend

### Build Static Files
```bash
# Build the Vue frontend
npm install
npm run build -w client
```

The built files will be in `client/dist/`.

### Option A: Deploy to OSS + CDN

```bash
# Create OSS bucket
aliyun oss mb oss://finops-frontend --region cn-hangzhou

# Enable static website hosting
aliyun oss website --method put oss://finops-frontend \
  --index index.html \
  --error index.html

# Upload built files
aliyun oss cp client/dist/ oss://finops-frontend/ --recursive

# Set bucket ACL to public-read (or use CDN with auth)
aliyun oss set-acl oss://finops-frontend public-read --update
```

### Option B: Deploy Frontend as Container (simpler)

```bash
# Build frontend image (nginx)
docker build -t finops-frontend:latest -f client/Dockerfile .

# Tag and push to ACR
docker tag finops-frontend:latest registry.cn-hangzhou.aliyuncs.com/finops/frontend:latest
docker push registry.cn-hangzhou.aliyuncs.com/finops/frontend:latest

# Deploy to SAE (same as Step 3, but use frontend image, port 80)
```

---

## Step 5: Configure Frontend to Point to API

Update `client/vite.config.ts` to set the API base URL for production:

```ts
// In vite.config.ts, add a build-time env var
server: {
  proxy: {
    '/api': {
      target: process.env.VITE_API_URL || 'http://localhost:3000',
      changeOrigin: true,
    },
  },
},
```

Or update `client/src/composables/useApi.ts` for production:

```ts
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
});
```

Then rebuild with the API URL:
```bash
VITE_API_URL=http://<your-sae-public-endpoint>:3000 npm run build -w client
```

---

## Step 6: Configure CORS on Backend

If frontend and backend are on different domains, update `server/src/index.ts`:

```ts
app.use(cors({
  origin: ['http://your-frontend-domain.com', 'https://your-frontend-domain.com'],
  credentials: true,
}));
```

---

## Quick Deploy (Docker Compose on ECS)

For the simplest deployment, use a single ECS instance with Docker Compose:

```bash
# On your ECS instance
git clone https://github.com/hanneng/Alibaba-Cloud-FinOps.git
cd Alibaba-Cloud-FinOps

# Update .env with production values
cp .env.example .env
# Edit .env: set a strong DATABASE_URL

# Start everything
docker compose up -d

# Initialize database
docker compose exec api npx tsx src/db/initDb.ts
```

Access at `http://<ecs-ip>:8080`

---

## Production Checklist

- [ ] Use strong database passwords
- [ ] Configure RDS security groups (restrict to SAE VPC only)
- [ ] Enable HTTPS on CDN/SLB
- [ ] Set up log collection (SLS)
- [ ] Configure backup for RDS and OSS
- [ ] Set up monitoring alerts (CloudMonitor)
- [ ] Restrict CORS origins in production
- [ ] Set `NODE_ENV=production` on backend
