@echo off

:: hook `iodist use <version>`
if "%1"=="use" goto env
if "%1"=="env" goto env
goto next1

:env
  call %0 + %2
  if ERRORLEVEL 0 (
    :: get version and set IOJS_VERSION
    FOR /F "tokens=1 delims=" %%A in ('"%0" add %2') do @set "IOJS_VERSION=%%A"
  )
  :: goto end
  GOTO end

:next1
:: hook `iodist update`
if "%1"=="update" goto selfupdate
if "%1"=="selfupdate" goto selfupdate
goto next2

:selfupdate
  echo Installing latest stable version...
  cmd /C iodist stable

  cmd /C npm config set prefix "%IODIST_PREFIX%\bin"

  echo Update dependencies...
  pushd .
  cd /D "%~dp0"
  cd ..
  cmd /C npm update
  popd

  
  ::goto end
   GOTO end

:next2
:main
"%~dp0..\node.exe" "%~dp0..\cli" %*
goto end

:end
