package main

import (
  "fmt"
  "os"
  "os/exec"
  "syscall"
  "io/ioutil"
  "strings"
)

const pathSep = string(os.PathSeparator)

func main() {
  // Prerequisites

  if "" == os.Getenv("IODIST_PREFIX") {
    fmt.Println("Please set the path to the iodist directory in the IODIST_PREFIX environment variable.")
    os.Exit(40)
  }


  // Determine version
  
  var version string = ""
  
  if v := os.Getenv("IOJS_VERSION"); v != "" {
    version = v
    //fmt.Println("IOJS_VERSION found:'", version, "'")
  } else
  if v = os.Getenv("IODIST_VERSION"); v != "" {
    version = v
    //fmt.Println("IODIST_VERSION found:'", version, "'")
  } else
  if v, _, err := getLocalVersion(); err == nil && strings.Trim(string(v), " \r\n") != "" {
    version = string(v)
    //fmt.Println("Local file found:'", version, "' @ ", localFile)
  } else
  if v, err := ioutil.ReadFile(os.Getenv("IODIST_PREFIX")+"\\.node-version"); err == nil {
    version = string(v)
    //fmt.Println("Global file found:'", version, "'")
  }

  version = strings.Trim(version, "v \r\n")

  if version == "" {
    fmt.Println("Sorry, there's a problem with iodist. Couldn't decide which node version to use. Please set a version.")
    os.Exit(41)
  }
  
  
  // Determine architecture

  x64 := (os.Getenv("PROCESSOR_ARCHITECTURE") == "x64")

  if wantX64 := os.Getenv("IODIST_X64"); wantX64 != "" {
    x64 = (wantX64 == "1")
  }


  // Set up binary path

  var path string
  var nodebin string

  path = os.Getenv("IODIST_PREFIX")+"/v"

  if x64 {
    path += "-x64"
  }
  
  path = path+"/"+version
  nodebin = path+"/iojs.exe"
  
  
  // Get args
  
  var nodeargs []string
  
  if a, err := ioutil.ReadFile(path+"/args"); err == nil && len(a) != 0 {
    argsFile := strings.Split(string(a), " ")
    nodeargs = append(nodeargs, argsFile...)
  }
  
  nodeargs = append(nodeargs, os.Args[1:]...)
  
  // Run node!
  
  cmd := exec.Command(nodebin, nodeargs...)
  cmd.Stdout = os.Stdout
  cmd.Stderr = os.Stderr
  cmd.Stdin = os.Stdin
  err := cmd.Run()
  
  if err != nil {
    exitError, isExitError := err.(*(exec.ExitError))
    if isExitError {
      // You know it. Black Magic...
      os.Exit(exitError.Sys().(syscall.WaitStatus).ExitStatus())
    } else {
      fmt.Println("Sorry, there's a problem with iodist.")
      fmt.Println("Error: ", err)
      os.Exit(42)
    }
  }
}

func getLocalVersion() (version string, file string, error error) {
  dir, err := os.Getwd()
  
  if err != nil {
    error = err
    return
  }
  
  dirSlice := strings.Split(dir, pathSep) // D:\Programme\iodist => [D:, Programme, iodist]
  
  for len(dirSlice) != 1 {
    dir = strings.Join(dirSlice, pathSep)
    file = dir+"\\.node-version"
    v, err := ioutil.ReadFile(file);
    
    if err == nil {
      version = string(v)
      return
    }

    if !os.IsNotExist(err) {
      error = err // some other error.. bad luck.
      return
    }
    
    // `$ cd ..`
    dirSlice = dirSlice[:len(dirSlice)-1] // pop the last dir
  }
  
  version = ""
  return
}