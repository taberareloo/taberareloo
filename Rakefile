# -*- ruby -*-
require 'rubygems'
require 'crxmake'
require 'json'
$name     = "taberareloo"
$manifest = "src/manifest.json"
$pem      = File.expand_path "~/dev/private/#{$name}.pem"
$manifest_data = File.open($manifest, 'rb'){|f| JSON.parse(f.read) }
$version = $manifest_data["version"]

# package task
namespace :pkg do
  desc "crx"
  task :crx do
    mkdir_p "pkg" unless File.exist?("pkg")
    package = "pkg/#{$name}.crx"
    rm package if File.exist?(package)
    CrxMake.make(
      :ex_dir => "src",
      :pkey   => $pem,
      :crx_output => package,
      :verbose => true,
      :ignorefile => /\.swp$/,
      :ignoredir => /^\.(?:svn|git)$|^CVS$/
    )
  end

  desc "zip"
  task :zip do
    mkdir_p "pkg" unless File.exist?("pkg")
    package = "pkg/#{$name}.zip"
    rm package if File.exist?(package)
    CrxMake.zip(
      :ex_dir => "src",
      :pkey   => "~/dev/private/taberareloo.pem",
      :zip_output => package,
      :verbose => true,
      :ignorefile => /\.swp$/,
      :ignoredir => /^\.(?:svn|git)$|^CVS$/
    )
  end
  directory "package"
end
# vim: syntax=ruby fileencoding=utf-8
