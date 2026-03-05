@echo off
echo ========================================
echo  CoinBot Railway Database Setup
echo ========================================
echo.

echo [1/4] Setting DATABASE_URL...
set DATABASE_URL=postgresql://postgres:YDBLyKNyzyLPrYwMtdpOYNnofFDjcwPc@caboose.proxy.rlwy.net:28708/railway

echo [2/4] Generating Prisma Client...
call npx prisma generate

echo [3/4] Pushing Schema to Railway Database...
call npx prisma db push --accept-data-loss

echo [4/4] Opening Prisma Studio to verify...
echo You can now view your database at http://localhost:5555
call npx prisma studio

pause
