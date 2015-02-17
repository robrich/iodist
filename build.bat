@echo off

go build -o "%~dp0\bin\iojs.exe" "%~dp0\src\shim.go"
:: xcopy "%~dp0\src\shim.exe" "%~dp0\bin.exe" /E /Y