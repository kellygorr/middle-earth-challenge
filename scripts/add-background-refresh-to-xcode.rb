#!/usr/bin/env ruby
# Adds the BackgroundRefreshStatus Swift module and its Obj-C bridge to the
# MiddleEarthChallenge Xcode target, and configures SWIFT_OBJC_BRIDGING_HEADER.
#
# Idempotent: safe to run multiple times.
#
# Usage: bundle exec ruby scripts/add-background-refresh-to-xcode.rb

require 'xcodeproj'
require 'pathname'

PROJECT_PATH = File.expand_path('../ios/MiddleEarthChallenge.xcodeproj', __dir__)
TARGET_NAME  = 'MiddleEarthChallenge'
GROUP_NAME   = 'MiddleEarthChallenge'

FILES = [
  { path: 'MiddleEarthChallenge/BackgroundRefreshStatus.swift', kind: :source },
  { path: 'MiddleEarthChallenge/BackgroundRefreshStatus.m',     kind: :source },
  { path: 'MiddleEarthChallenge/MiddleEarthChallenge-Bridging-Header.h', kind: :header },
]

BRIDGING_HEADER_BUILD_SETTING_VALUE =
  'MiddleEarthChallenge/MiddleEarthChallenge-Bridging-Header.h'

project = Xcodeproj::Project.open(PROJECT_PATH)
target  = project.targets.find { |t| t.name == TARGET_NAME }
raise "Target #{TARGET_NAME} not found" unless target

group = project.main_group[GROUP_NAME]
raise "Group #{GROUP_NAME} not found" unless group

added = []
FILES.each do |entry|
  rel_path = entry[:path]
  basename = File.basename(rel_path)

  # Skip if already referenced anywhere in the project.
  existing = project.files.find { |f| f.path == rel_path || f.path&.end_with?(basename) }
  if existing
    puts "= already in project: #{rel_path}"
    file_ref = existing
  else
    # Add file reference under the MiddleEarthChallenge group, but with the
    # path relative to the group (which is the MiddleEarthChallenge folder),
    # so the basename works.
    file_ref = group.new_file(basename)
    puts "+ added file reference: #{rel_path}"
  end

  if entry[:kind] == :source
    already_built =
      target.source_build_phase.files_references.any? { |fr| fr == file_ref }
    if already_built
      puts "= already in Compile Sources: #{basename}"
    else
      target.source_build_phase.add_file_reference(file_ref, true)
      added << basename
      puts "+ added to Compile Sources: #{basename}"
    end
  end
end

# Set the bridging header in every build configuration.
target.build_configurations.each do |config|
  current = config.build_settings['SWIFT_OBJC_BRIDGING_HEADER']
  if current == BRIDGING_HEADER_BUILD_SETTING_VALUE
    puts "= bridging header already set in config '#{config.name}'"
  else
    config.build_settings['SWIFT_OBJC_BRIDGING_HEADER'] =
      BRIDGING_HEADER_BUILD_SETTING_VALUE
    puts "+ set SWIFT_OBJC_BRIDGING_HEADER in config '#{config.name}'"
  end

  # Swift version is usually inherited from the React Native template, but
  # set a sensible default if it's missing so the Swift file actually builds.
  unless config.build_settings['SWIFT_VERSION']
    config.build_settings['SWIFT_VERSION'] = '5.0'
    puts "+ set SWIFT_VERSION=5.0 in config '#{config.name}'"
  end
end

project.save
puts "\nDone. Added: #{added.join(', ').empty? ? '(nothing new)' : added.join(', ')}"
puts "Run `cd ios && pod install` if Pods aren't up to date, then rebuild."
