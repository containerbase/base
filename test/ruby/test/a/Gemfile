# frozen_string_literal: true

source 'https://rubygems.org'

git_source(:github) { |repo| "https://github.com/#{repo}.git" }

ruby '2.6.4'

# Heavy metal SOAP client
gem 'savon', '2.12.0'

# Bundle edge Rails instead: gem 'rails', github: 'rails/rails'
gem 'rails', '~> 6.0.0'

# Use postgresql as the database for Active Record
gem 'pg', '>= 0.18', '< 2.0'

# Reduces boot times through caching; required in config/boot.rb
gem 'bootsnap', '>= 1.4.2', require: false

# Use Puma as the app server
gem 'puma', '~> 4.1'

# Code lintern
gem 'rubocop', '~> 0.74.0', require: false

# Exception tracking
gem 'airbrake', '~> 9.4'

# GraphQL Ruby
gem 'graphql', '~> 1.9.10'

# Simple authorization gem for GraphQL
gem 'graphql-guard'

# Paginator for Ruby
gem 'kaminari-activerecord'

# DRY gem for business transactions
gem 'dry-transaction'

# DRY gem for validations
gem 'dry-validation'

# Ruby client for Amazon S3
gem 'aws-sdk-s3', '~> 1'

# Only used to import encryption keys (lib/tasks/encryption_keys.rake)
gem 'rubyzip'

# Simple, efficient background processing for Ruby
gem 'sidekiq', '~> 6.0.2'

# Records stats of each sidekiq queue and exposes APIs to retrieve them
gem 'sidekiq_queue_metrics', git: 'https://github.com/ivanetchart/sidekiq_queue_metrics.git', branch: 'v3.0'

# A Kafka producer and consumer
gem 'poseidon', '~> 0.0.5'

gem 'nokogiri'

gem 'data_migrate'

gem 'curb'

group :development, :test do
  # Call 'byebug' anywhere in the code to stop execution and get a debugger console
  gem 'byebug', platforms: %i[mri mingw x64_mingw]
  # Security analysis
  gem 'brakeman'
  # Code coverage tool
  gem 'simplecov', require: false
end

group :development do
  gem 'listen', '>= 3.0.5', '< 3.2'
  # Spring speeds up development by keeping your application running in the background.
  # Read more: https://github.com/rails/spring
  gem 'spring'
  gem 'spring-watcher-listen', '~> 2.0.0'
  # Annotate Rails classes with schema and routes info
  gem 'annotate', '~> 2.7.5'
end

group :test do
  gem 'factory_bot', '~> 5.0.2'
  gem 'faker', '~> 2.1.2'
  gem 'rspec-rails', '~> 3.8.2'
  gem 'shoulda-matchers', '~> 4.1.2'
  gem 'timecop'
  # WebMock allows stubbing HTTP requests and setting expectations on HTTP requests.
  gem 'webmock'
  # RSpec for Sidekiq
  gem 'rspec-sidekiq'
  gem 'simplecov-cobertura'
end
