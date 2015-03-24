/*!
 * iodist
 * A Node version manager for the windows folks out there.
 * Copyright 2012 by Marcel Klehr <mklehr@gmx.net>
 *
 * (MIT LICENSE)
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

var child_process = require('child_process')
  , mkdirp     = require('mkdirp')
  , request    = require('request')
  , fs         = require('fs')
  , path       = require('path')
  , rimraf     = require('rimraf')
  , vermanager = require('./versions')
;

/**
Iodist instance
@param sourceUrl is the url to fetch node versions from
@param sourceDir is the path to the directory in which to store installed node versions
@param proxy is proxy setting if is needed
@param wantX64 '0' or '1'
@param envVersion the IODIST_VERSION env vars
*/
module.exports = iodist = function iodist(sourceUrl, iodistDir, proxy, wantX64, envVersion) {
  this.wantX64 = wantX64;
  this.sourceUrl = sourceUrl;
  this.iodistDir = iodistDir
  this.sourceDir = iodistDir+'\\'+(this.wantX64? 'v-x64': 'v');
  this.proxy = proxy;
  this.envVersion = envVersion
  
  // Create source dir if unexistant
  mkdirp.sync(this.sourceDir);
};

iodist.prototype.setWantX64 = function(wantX64) {
	this.wantX64 = wantX64;
}

/**
Determine the version of the passed node exe
@param file the path to the node.exe to test
@param cb A callback with (error, node_version)
*/
iodist.determineVersion = function determineVersion(file, cb) {
  var returned = false;
  
  var node = child_process.spawn(file, ['-v']);
  node.stdout.on('data', function (data) {
    var version = data.toString().trim().replace(/v(\d+\.\d+\.\d+)/, '$1');
    if(!returned) cb(null, version);
    returned = true;
  });
  node.on('error', function (err) {
    if(!returned) cb(err);
    returned = true;
  });
  node.on('exit', function (err) {
    if(!returned) cb(err);
    returned = true;
  });
}

/**
Returns the path to the executable of the passed node version
(Relies on n.sourceDir)
*/

iodist.prototype.getVersionDir = function getVersionDir(version) {
  return this.sourceDir+'\\'+version
}

iodist.prototype.getPathToExe = function getPathToExe(version) {
  return this.getVersionDir(version)+'\\iojs.exe'
}

iodist.prototype.getPathToGlobalVersion = function getPathToGlobalVersion() {
  return this.iodistDir+'\\.iojs-version'
}

iodist.prototype.getUrlToExe = function getUrlToExe(version) {
  return this.sourceUrl+'/v'+version+(this.wantX64?'/win-x64':'/win-x86')+'/iojs.exe'
}

/**
List all available node versions distributed by n.sourceUrl
@param cb A callback with (error, array_of_versions)
*/
iodist.prototype.listAvailable = function listAvailable(cb) {
  var n = this;

  if(n.availableCache) return cb(null, n.availableCache);

  request({proxy: n.proxy, uri: n.sourceUrl+'/index.json'}, function(err, resp, body) {
    if(err) return cb(new Error('Couldn\'t list available versions: '+err.message));
    if(resp.statusCode != 200) return cb(new Error('Couldn\'t list available versions: HTTP '+resp.statusCode));

    var map = {},
      versions = [];
    body
    .map(function(v){
      return v.version
    })
    .sort(function(v1, v2) {
      return vermanager.compareable(v1) > vermanager.compareable(v2) ? 1 : -1;
    })
    .forEach(function(v) {
      v = v.substr(0, v.length-1);
      if(map[v]) return;
      map[v] = v;
      versions.push(v);
    });

    n.availableCache = versions;
    cb(null, versions);
  });
};

/**
List all node versions installed in n.sourceDir
@param cb A callback with (error, array_of_versions)
*/
iodist.prototype.listInstalled = function listInstalled(cb) {
  var n = this;

  if(n.installedCache) return cb(null, n.installedCache);

  fs.readdir(this.sourceDir, function(err, ls){
    if(err) return cb({message: 'Reading the version directory '+n.sourceDir+' failed: '+err.message});
    
    ls.sort(function(val1, val2){
      return vermanager.compareable(val1) > vermanager.compareable(val2) ? 1 : -1;
    });

    n.installedCache = ls
    return cb(null, ls);
  })
};

/**
Resolves version specs given by the user
relative to available versions and installed versions
*/
iodist.prototype.resolveVersion = function(version_spec, cb) {
  var n = this;
  n.listAvailable(function(er, list) {
    if(er) {
      n.listInstalled(function(er, list) {
        if(er) return cb(er);
        vermanager.find(version_spec, list, cb);
      });
      return;
    }
    vermanager.find(version_spec, list, cb);
  });
};

/**
Install the passed version
This will first check, if the version is already installed.

@param version The version to install
@param cb A callback with (error)
*/
iodist.prototype.install = function install(version, cb) {
  var n = this;
  this.listInstalled(function(err, installed){
    if(err) return cb(err);
    
    n.listAvailable(function(err, available) {
      if(installed.indexOf(version) != -1)
        return cb(null, version);// already installed.
      
      n.fetch(version, function(err) {
        if(err) return cb(err);
        return cb(null, version);
      });
    });
  });
};

/**
Install all available versions.

@param cb A callback with (error, installed_version) that gets called for each version that is installed.
*/
iodist.prototype.installAll = function(cb) {
  var n = this;
  
  this.listInstalled(function(err, installed) {
    if(err) return cb(err);
    
    n.listAvailable(function(err, available) {
      if(err) return cb(err);
      available.forEach(function(version) {
        if(installed.indexOf(version) != -1)
          return cb(null, version);
        
        n.fetch(version, function(err) {
          if(err) return cb(err);
          return cb(null, version);
        });
      });
    });
  });
};

/**
Remove an installed version
@param version the version to remove
@param cb A callback with (error)
*/
iodist.prototype.remove = function remove(version, cb) {
  var n = this;
  var exe = this.getPathToExe(version);
  var versionDir = path.dirname(exe)
  
  fs.exists(versionDir, function(exists) {
    if(exists) return rimraf(versionDir, function(err) {
      if(err) return cb(err);
      cb();
    });
    cb();// don't cry if it doesn't exist
  });
};

/**
Downloads the passed version from n.sourceUrl
@param version The version to download
@param cb A callback with (error, array_of_versions)
*/
iodist.prototype.fetch = function fetch(version, callback) {
  var n = this;
  var url = this.getUrlToExe(version);
  var fetch_target = this.getPathToExe(version);
  
  // callback proxy (clean up things on error)
  var cb = function(err) {
    if(err) {
      n.remove(version, function(e) {// clean up
        if(e) return callback(new Error(err.message+'. Couldn\'t clean after error: '+e.message));
        callback(err);// pass on the error
      });
      return;
    }

    return callback(null, version);
  };
  
  // create path if necessary
  mkdirp.sync(path.dirname(fetch_target));
  
  // fetch from url
  var stream = request({proxy: n.proxy, url: url, pool: {maxSockets: 25}}, function(err, resp){
    if(err || resp.statusCode != 200) {
      return cb(new Error('Couldn\'t fetch '+version+': '+(err? err.message : 'HTTP '+resp.statusCode)));
    }
    cb();
  });
  var writer = fs.createWriteStream(fetch_target);
  stream.pipe(writer);
  stream.on('error', function(err) {
    cb(new Error('Couldn\'t fetch '+version+': '+err.message));
  });
  writer.on('error', function(err) {
    cb(new Error('Couldn\'t write fetched version '+version+': '+err.message));
  });
};

/**
Sets the global node version
*/
iodist.prototype.setGlobal = function setGlobal(version, cb) {
  var n = this;
  
  this.install(version, function(err){
    if(err) return cb(err);
    
    var globalFile = n.getPathToGlobalVersion();
  
    fs.writeFile(globalFile, version, function(er) {
      if(er) return cb(new Error('Couldn\'t activate version '+version+' ('+er.message+')'))
      cb(null)
    })
  });
};

/**
Gets the global node version
*/
iodist.prototype.getGlobal = function getGlobal(cb) {
  var n = this;
  
  var globalFile = this.getPathToGlobalVersion()

  fs.readFile(globalFile, function(er, version) {
    if(er) return cb(er)
    
    cb(null, version.toString().trim())
  })
};

/**
Sets the local node version
*/
iodist.prototype.setLocal = function setLocal(version, cb) {
  var n = this;

  this.install(version, function(err){
    if(err) return cb(err);
    
    fs.writeFile("./.iojs-version", version, function(er) {
      if(er) return cb(new Error('Couldn\'t activate version '+version+' ('+er.message+')'))
      cb(null, process.cwd()+'\\.iojs-version')
    })
  });
};

/**
Gets the local node version
*/
iodist.prototype.getLocal = function getLocal(cb) {
  var n = this;
  
  var dir = process.cwd()
    , dirArray = dir.split("\\")
  
  search()
  
  function search() {
    if(dirArray.length == 0) return cb(null)
    
    dir = dirArray.join('\\')
    
    var file = dir+"\\.iojs-version"
    fs.readFile(file, function(er, version) {
      if(er) {
        dirArray.pop()
        return search()
      }
      
      cb(null, version.toString().trim(), file)
    })
    
  }
};

/**
Gets the environmental node version
*/
iodist.prototype.getEnv = function getEnv(cb) {
  var n = this;
  
  if(!this.envVersion) return cb()
  
  cb(null, this.envVersion)
};

/**
Sets additional arguments to be used when running a specific version
*/
iodist.prototype.setArgsForVersion = function setArgsForVersion(version, args, cb) {
  var n = this;

  this.install(version, function(err) {
    if(err) return cb(err);
    
    var argsFile = n.getVersionDir(version)+"/args"
    fs.writeFile(argsFile, args, function(er) {
      if(er) return cb(new Error('Couldn\'t write args to file '+argsFile+' ('+er.message+')'))
      cb()
    })
  })
};

/**
Gets additional arguments to be used for a specific version
*/
iodist.prototype.getArgsForVersion = function getArgsForVersion(version, cb) {
  var n = this;
  
  fs.readFile(n.getVersionDir(version)+"/args", function(er, args) {
    if(er) return cb(er)
    
    cb(null, args.toString().trim())
  })
};

/**
Emulates the passed node version with args
@param cb A callback with (error) Will be called on error or exit.
*/
iodist.prototype.emulate = function emulate(version, args, cb) {
  var n = this;

  this.install(version, function(err) {
    if(err) return cb(err);
    
    var node = child_process.spawn(n.getPathToExe(version), args, {
      stdio: 'inherit',
      cwd: path.resolve('.')
    });
    node.on('exit', cb.bind(n, null));// onexit: cb(err=null, code)
  });
};