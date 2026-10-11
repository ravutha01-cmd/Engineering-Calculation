@echo off
rem CAMBO STRUCT - ETABS live link. Open ETABS with the model first, then double-click this file.
cd /d "%~dp0"
python -c "import comtypes" 2>nul || python -m pip install comtypes
python etabs_bridge.py %*
pause
