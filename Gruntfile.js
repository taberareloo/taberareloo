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

  module.exports = function (grunt) {
    grunt.initConfig({
      jshint: {
        all: [
          'Gruntfile.js',
          'src/lib/background.js',
          'src/lib/content.js',
          // 'src/lib/extractors.js',
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
      }
    });

    // load tasks
    grunt.loadNpmTasks('grunt-contrib-jshint');

    // alias
    grunt.registerTask('lint', 'jshint');
    grunt.registerTask('travis', 'jshint');
    grunt.registerTask('default', 'lint');
  };
}());
/* vim: set sw=2 ts=2 et tw=80 : */
