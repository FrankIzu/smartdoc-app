#!/usr/bin/env ruby
# Adds GrabDocsBroadcastUpload as a PBXTargetDependency of the main app target
# so CocoaPods can resolve the host relationship during `pod install`.
#
# CocoaPods 1.2.1+ requires the host app target to list the extension in its
# `dependencies` array (PBXTargetDependency + PBXContainerItemProxy) in addition
# to the Embed App Extensions copy-files phase. Without this, pod install fails:
#   "[!] Unable to find host target(s) for GrabDocsBroadcastUpload"
#
# Uses the xcodeproj gem (already installed with CocoaPods) so the change is
# semantically identical to what Xcode itself writes.

require 'xcodeproj'

XCODEPROJ = Dir.glob('ios/*.xcodeproj').first
unless XCODEPROJ
  abort('[patch-pbxproj] ERROR: No .xcodeproj found under ios/')
end

project = Xcodeproj::Project.open(XCODEPROJ)

main_target = project.targets.find { |t| t.product_type == 'com.apple.product-type.application' }
ext_target  = project.targets.find { |t| t.product_type == 'com.apple.product-type.app-extension' }

unless main_target
  abort('[patch-pbxproj] ERROR: Could not find main app target (com.apple.product-type.application)')
end
unless ext_target
  abort('[patch-pbxproj] ERROR: Could not find extension target (com.apple.product-type.app-extension)')
end

puts "[patch-pbxproj] Main target:      #{main_target.name} (#{main_target.uuid})"
puts "[patch-pbxproj] Extension target: #{ext_target.name} (#{ext_target.uuid})"

# Check whether the dependency is already in place
already = main_target.dependencies.any? { |d| d.target == ext_target }
if already
  puts '[patch-pbxproj] ✅ Dependency already present — nothing to do.'
  exit 0
end

# Use the gem's built-in method: creates PBXTargetDependency + PBXContainerItemProxy,
# sets containerPortal, proxyType, remoteGlobalIDString, remoteInfo with correct UUIDs.
main_target.add_dependency(ext_target)
project.save
puts "[patch-pbxproj] ✅ Added #{ext_target.name} as dependency of #{main_target.name}."
