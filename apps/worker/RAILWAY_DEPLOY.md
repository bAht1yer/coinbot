# Railway Deployment - Production Ready

## ✅ Updated for Professional CI/CD

Following production best practices, the deployment now handles:

### Key Improvements

1. **Runtime Migrations** (Not Build Time)
   - `prisma migrate deploy` runs when container starts
   - Database connection only happens at runtime
   - No build failures from missing DATABASE_URL

2. **Alpine Linux Compatibility**
   - `binaryTargets` includes `linux-musl-openssl-3.0.x`
   - OpenSSL installed in production image
   - Works on Railway's infrastructure

3. **Package Scripts**
   ```json
   "postinstall": "prisma generate"     // Auto-generates after npm install
   "start:prod": "npx prisma migrate deploy && node dist/worker.js"
   ```

4. **Optimized Dockerfile**
   - Proper layer caching
   - Prisma migrations folder copied for runtime
   - Non-root user for security
   - Multi-stage build reduces final image size

### Deploy to Railway

```bash
# Push to GitHub
git add .
git commit -m "Production-ready Railway deployment"
git push

# Railway auto-detects and builds
# Watch logs for:
# ✅ "No pending migrations to apply" or "Applying migration..."
# ✅ "Bot started..."
```

### What Happens on Deploy

1. **Build Stage**: Compiles TypeScript, generates Prisma client
2. **Production Stage**: Copies only necessary files
3. **Runtime**: Container starts → Runs migrations → Starts bot

### Zero Downtime Updates

When you modify schema:
1. Update `prisma/schema.prisma`
2. Create migration: `npx prisma migrate dev --name your_change`
3. Commit and push
4. Railway auto-deploys and applies migration

**No manual intervention needed!**

## Commands

### Local Development
```bash
npm install        # Triggers postinstall (prisma generate)
npm run build      # Compile TypeScript
npm run dev        # Run with ts-node
```

### Production
```bash
npm run start:prod # Migrate + Start (used by Docker/Railway)
```

### Create Migration (when schema changes)
```bash
npx prisma migrate dev --name add_new_field
```

This is the **professional** way to handle database deployments. 🚀
