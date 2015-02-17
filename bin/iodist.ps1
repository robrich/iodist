param($cmd,$ver,[Switch]$v)
if ($cmd -eq "use" -or $cmd -eq "env") {
  $version = (iodist.cmd add $ver)
  if($LastExitCode -eq 0) {
    $env:NODIST_VERSION = $version
    echo $env:NODIST_VERSION
  }
}
elseif ($v){
  iodist.cmd -v
}
else {
  iodist.cmd $cmd $ver ([string]$args)
}