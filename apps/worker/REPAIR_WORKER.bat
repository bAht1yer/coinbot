@echo off
echo 🛑 Stopping any running node processes for worker...
echo (You may need to manually close the worker terminal window if this doesn't work)

cd /d "%~dp0"

echo.
echo 🔄 Generating Prisma Client...
call npx prisma generate

echo.
echo ✅ Repair complete!
echo 🚀 Starting worker...
npm start
