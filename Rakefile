# -*- ruby -*-
require 'rubygems'
require 'crxmake'
require 'json'
$name     = 'taberareloo'
$manifest = "src/manifest.json"
$manifest_data = File.open($manifest, 'rb'){|f| JSON.parse(f.read) }
$version = $manifest_data["version"]

# package task
desc "package"
task :package do
  mkdir_p "package" unless File.exist?("package")
  package = "package/#{$name}.crx"
  rm package if File.exist?(package)
  CrxMake.make(
    :ex_dir => "src",
    :pkey   => "~/dev/private/taberareloo.pem",
    :crx_output => package,
    :verbose => true,
    :ignorefile => /\.swp$/,
    :ignoredir => /(?:^\.(?:svn|git)$|^CVS$)/
  )
end

directory "package"
# vim: syntax=ruby
