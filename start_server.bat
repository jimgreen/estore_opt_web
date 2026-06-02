@echo off
setlocal
cd /d "%~dp0\.."
python estore_opt_web\server.py --host 127.0.0.1 --port 8877
