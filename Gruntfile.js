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

  var semver = require('semver');
  var request = require('request');
  var xml2js = require('xml2js');
  var Promise = require('bluebird');

  var base    = 'https://drone.io/github.com/Constellation/taberareloo/files/pkg/taberareloo.crx';
  var updates = 'https://drone.io/github.com/Constellation/taberareloo/files/pkg/updates.xml';
  var key;

  if (process.env.CI === 'yes') {
    key = process.env.PRIVATE;
    if (key.indexOf('\n') < 0) {
      key = key.replace(/\\n/g, '\n');
    }
  }

  module.exports = function (grunt) {
    grunt.initConfig({
      jshint: {
        all: [
          'Gruntfile.js',
          'src/lib/background.js',
          'src/lib/command_queue.js',
          'src/lib/content.js',
          'src/lib/extractors.js',
          'src/lib/menu.js',
          // 'src/lib/models.js',
          'src/lib/options.js',
          'src/lib/patch.js',
          'src/lib/popup.js',
          'src/lib/proto.js',
          'src/lib/repository.js',
          'src/lib/sandbox.js',
          'src/lib/userscripts.js',
          'src/lib/utils.js'
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
        }
      },
      clean: {
        canary: ['out']
      },
      copy: {
        canary: {
          files: [
            {expand: true, cwd: 'src/', src: ['**'], dest: 'out/'},
          ]
        }
      }
    });

    // load tasks
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-crx');

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
    grunt.registerTask('lint', 'jshint');
    grunt.registerTask('travis', 'jshint');
    grunt.registerTask('default', 'lint');
    grunt.registerTask('canary', ['clean:canary', 'copy:canary', 'canary-manifest', 'crx:canary', 'clean:canary']);
  };
}());
/* vim: set sw=2 ts=2 et tw=80 : */
