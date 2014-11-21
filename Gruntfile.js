/*
  Copyright (C) 2013 Yusuke Suzuki <utatane.tea@gmail.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
/*jshint node: true */
(function () {
  'use strict';

  var fs = require('fs');
  var path = require('path');
  var semver = require('semver');
  var request = require('request');
  var xml2js = require('xml2js');
  var Promise = require('bluebird');

  var base    = 'https://drone.io/github.com/taberareloo/taberareloo/files/pkg/taberareloo.crx';
  var updates = 'https://drone.io/github.com/taberareloo/taberareloo/files/pkg/updates.xml';
  var PRIVATE_KEY = 'private.pem';
  var CREDENTIALS = 'oauth.json';

  function getBrowserPath() {
    var candidates = [], i, iz, p;
    if (process.platform === 'darwin') {
      candidates = [
        path.join(process.env.HOME, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      ];
    } else if (process.platform === 'linux') {
      candidates = [
        '/usr/bin/google-chrome'
      ];
    } else {
      throw new Error('Unknown platform ' + process.platform + '.');
    }
    for (i = 0, iz = candidates.length; i < iz; ++i) {
      p = candidates[i];
      if (fs.existsSync(p)) {
        return p;
      }
    }
  }

  module.exports = function (grunt) {
    var key;
    var credentials = {};

    function readPrivateKey(filename) {
      var key;

      if (process.env.CI === 'yes') {
        key = process.env.PRIVATE;
        if (key.indexOf('\n') < 0) {
          return key.replace(/\\n/g, '\n');
        }
      }

      if (grunt.file.exists(filename)) {
        return grunt.file.read(filename);
      }

      return null;
    }

    function readCredentials(filename) {
      if (process.env.CI === 'yes') {
        return {
          client_id: process.env.CLIENT_ID,
          client_secret: process.env.CLIENT_SECRET
        };
      }

      if (grunt.file.exists(filename)) {
        return JSON.parse(grunt.file.read(filename));
      }

      return {};
    }

    key = readPrivateKey(PRIVATE_KEY);
    credentials = readCredentials(CREDENTIALS);

    grunt.initConfig({
      jshint: {
        all: [
          'Gruntfile.js',
          'src/lib/*.js'
        ],
        options: {
          jshintrc: '.jshintrc',
          force: false
        }
      },
      crx: {
        canary: {
          src: 'out/',
          dest: 'pkg/taberareloo.crx',
          baseURL: base,
          privateKey: key
        },
        master: {
          src: 'src/',
          dest: 'pkg/taberareloo.crx',
          baseURL: base,
          privateKey: key
        }
      },
      clean: {
        canary: ['out']
      },
      compress: {
        master: {
          options: {
            archive: 'pkg/taberareloo.zip'
          },
          files: [
            { expand: true, cwd: 'src/', src: [ '**/*' ], dest: './' }
          ]
        },
        canary: {
          options: {
            archive: 'pkg/taberareloo.zip'
          },
          files: [
            { expand: true, cwd: 'out/', src: [ '**/*' ], dest: './' }
          ]
        }
      },
      copy: {
        canary: {
          files: [
            { expand: true, cwd: 'src/', src: [ '**' ], dest: 'out/'},
          ]
        }
      },
      webstore_upload: {
        browser_path: getBrowserPath(),
        accounts: {
          default: {
            publish: true,
            client_id: credentials.client_id,
            client_secret: credentials.client_secret,
          }
        },
        extensions: {
          master: {
            appID: 'ldcnohnnlpgglecmkldelbmiokgmikno',
            zip: 'pkg/taberareloo.zip'
          }
        }
      },
      shell: {
        'release-patch': {
          command: 'node_modules/.bin/xyz -t X.Y.Z -m "version X.Y.Z" -i patch'
        },
        'release-minor': {
          command: 'node_modules/.bin/xyz -t X.Y.Z -m "version X.Y.Z" -i minor'
        },
        'release-major': {
          command: 'node_modules/.bin/xyz -t X.Y.Z -m "version X.Y.Z" -i major'
        }
      },
      mocha_phantomjs: {
        options: {
          reporter: 'spec'
        },
        all: [ 'test/index.html' ]
      }
    });

    // load tasks
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-crx');
    grunt.loadNpmTasks('grunt-contrib-compress');
    grunt.loadNpmTasks('grunt-webstore-upload');
    grunt.loadNpmTasks('grunt-shell');
    grunt.loadNpmTasks('grunt-mocha-phantomjs');

    grunt.registerTask('canary-manifest', 'register canary version and update URL in manifest.json', function () {
      var done = this.async();
      var manifest = grunt.file.readJSON('src/manifest.json');

      function getStamp(current) {
        return new Promise(function (resolve) {
          request(updates, function (error, response, body) {
            var parser;
            if (error || response.statusCode !== 200) {
              return resolve(0);
            }
            parser = new xml2js.Parser();
            parser.parseString(body, function (error, result) {
              var version, vs, build;
              if (error) {
                return resolve(0);
              }
              // 2 or 3 dot style: major.minor.patch.build
              version = result.gupdate.app[0].updatecheck[0].$.version;
              vs = version.split('.');

              // contains build level
              if (vs.length === 4) {
                build = parseInt(vs.pop(), 10) + 1;
              } else {
                build = 1;
              }
              version = vs.join('.');
              if (semver.lt(version, current)) {
                build = 0;
              }
              return resolve(build);
            });
          });
        });
      }

      getStamp(manifest.version).then(function (stamp) {
        var date = new Date();
        var version;

        version = manifest.version + '.' + stamp;
        grunt.log.writeln('packaging as version ' + version);
        manifest.version = version;
        manifest.update_url = updates;
        manifest.name = 'Taberareloo Canary';
        manifest.description = 'Taberareloo Canary build at ' + date;
        grunt.file.write('out/manifest.json', JSON.stringify(manifest, null, 2));
        done();
      });
    });

    // alias
    grunt.registerTask('canary:build', [
      'clean:canary',
      'copy:canary',
      'canary-manifest',
      'crx:canary',
      'compress:canary',
      'clean:canary'
    ]);

    grunt.registerTask('master:build', [
      'crx:master',
      'compress:master'
    ]);

    grunt.registerTask('master:upload', [
      'compress:master',
      'webstore_upload:master'
    ]);

    grunt.registerTask('release-patch', ['shell:release-patch']);
    grunt.registerTask('release-minor', ['shell:release-minor']);
    grunt.registerTask('release-major', ['shell:release-major']);
    grunt.registerTask('test', ['mocha_phantomjs']);
    grunt.registerTask('lint', 'jshint');
    grunt.registerTask('travis', ['jshint', 'test']);
    grunt.registerTask('default', 'lint');
  };
}());
/* vim: set sw=2 ts=2 et tw=80 : */
