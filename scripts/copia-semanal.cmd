@echo off
rem Copia de seguridad semanal: la ejecuta el Programador de tareas de Windows (viernes 18:00).
rem Deja el resultado de cada ejecucion en backups\registro.txt
cd /d "%~dp0.."
if not exist backups mkdir backups
echo ===== %date% %time% =====>> backups\registro.txt
call npm run backup --silent >> backups\registro.txt 2>&1
if errorlevel 1 (echo LA COPIA FALLO>> backups\registro.txt) else (echo Copia OK>> backups\registro.txt)
