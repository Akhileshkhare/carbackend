CREATE DATABASE IF NOT EXISTS gacciajz_cocacars_admin
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE gacciajz_cocacars_admin;

CREATE TABLE IF NOT EXISTS admins (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'operations', 'inspector') NOT NULL DEFAULT 'operations',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_admins_role_active (role, active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id CHAR(64) NOT NULL PRIMARY KEY,
  admin_id BIGINT UNSIGNED NOT NULL,
  csrf_token CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessions_admin FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE,
  INDEX idx_sessions_expiry (expires_at),
  INDEX idx_sessions_admin (admin_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dealers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  contact_no VARCHAR(24) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_dealers_name (name),
  INDEX idx_dealers_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS buyers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  contact_no VARCHAR(24) NOT NULL,
  city VARCHAR(100) NOT NULL,
  listing_limit SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('active', 'inactive', 'pending') NOT NULL DEFAULT 'active',
  registered_at DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_buyers_name (name),
  INDEX idx_buyers_status_city (status, city)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sellers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  contact_no VARCHAR(24) NOT NULL,
  city VARCHAR(100) NOT NULL,
  status ENUM('active', 'inactive', 'pending') NOT NULL DEFAULT 'active',
  registered_at DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sellers_name (name),
  INDEX idx_sellers_status_city (status, city)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS listings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  registration_no VARCHAR(24) NOT NULL UNIQUE,
  seller_id BIGINT UNSIGNED NULL,
  ref_id VARCHAR(32) NOT NULL UNIQUE,
  brand VARCHAR(80) NOT NULL,
  model VARCHAR(100) NOT NULL,
  model_year SMALLINT UNSIGNED NOT NULL,
  variant VARCHAR(120) NOT NULL,
  body_type VARCHAR(60) NOT NULL,
  fuel_type ENUM('petrol', 'diesel', 'electric', 'hybrid', 'cng', 'lpg') NOT NULL,
  transmission ENUM('manual', 'automatic', 'amt', 'cvt') NOT NULL,
  kilometers INT UNSIGNED NOT NULL,
  color VARCHAR(50) NOT NULL,
  price DECIMAL(12,2) UNSIGNED NOT NULL,
  registration_date DATE NOT NULL,
  owner_count TINYINT UNSIGNED NOT NULL,
  insurance_type VARCHAR(60) NOT NULL,
  insurance_expiry DATE NULL,
  state VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  seller_name VARCHAR(160) NOT NULL,
  seller_mobile VARCHAR(24) NOT NULL,
  address VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  features JSON NOT NULL,
  status ENUM('draft', 'available', 'reserved', 'sold', 'archived') NOT NULL DEFAULT 'available',
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  is_home BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_listing_seller FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE SET NULL,
  INDEX idx_listings_status_created (status, created_at),
  INDEX idx_listings_vehicle (brand, model, model_year),
  INDEX idx_listings_price (price),
  FULLTEXT INDEX ft_listings_search (registration_no, ref_id, brand, model, variant, seller_name),
  CONSTRAINT chk_listing_model_year CHECK (model_year BETWEEN 1950 AND 2200),
  CONSTRAINT chk_listing_owner_count CHECK (owner_count BETWEEN 1 AND 20)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quick_listings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ref_id VARCHAR(32) NOT NULL UNIQUE,
  registration_no VARCHAR(24) NOT NULL,
  customer_name VARCHAR(160) NOT NULL,
  mobile VARCHAR(24) NOT NULL,
  address VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  pincode VARCHAR(12) NOT NULL,
  brand VARCHAR(80) NOT NULL,
  model VARCHAR(100) NOT NULL,
  variant VARCHAR(120) NOT NULL,
  price DECIMAL(12,2) UNSIGNED NOT NULL,
  appointment_at DATETIME NULL,
  assigned_to BIGINT UNSIGNED NULL,
  inspection_status ENUM('pending', 'inspecting', 'completed') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_quick_assignee FOREIGN KEY (assigned_to) REFERENCES admins(id) ON DELETE SET NULL,
  INDEX idx_quick_status_created (inspection_status, created_at),
  INDEX idx_quick_mobile (mobile)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS inspections (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  listing_id BIGINT UNSIGNED NULL,
  quick_listing_id BIGINT UNSIGNED NULL,
  ref_id VARCHAR(32) NOT NULL UNIQUE,
  registration_no VARCHAR(24) NOT NULL,
  customer_name VARCHAR(160) NOT NULL,
  mobile VARCHAR(24) NOT NULL,
  assigned_to BIGINT UNSIGNED NULL,
  status ENUM('pending', 'inspecting', 'completed') NOT NULL DEFAULT 'pending',
  scheduled_at DATETIME NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_inspection_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL,
  CONSTRAINT fk_inspection_quick FOREIGN KEY (quick_listing_id) REFERENCES quick_listings(id) ON DELETE SET NULL,
  CONSTRAINT fk_inspection_assignee FOREIGN KEY (assigned_to) REFERENCES admins(id) ON DELETE SET NULL,
  INDEX idx_inspections_status_date (status, scheduled_at),
  INDEX idx_inspections_registration (registration_no),
  INDEX idx_inspections_mobile (mobile)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quality_checks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  inspection_id BIGINT UNSIGNED NULL,
  listing_id BIGINT UNSIGNED NULL,
  ref_id VARCHAR(32) NOT NULL UNIQUE,
  registration_no VARCHAR(24) NOT NULL,
  customer_name VARCHAR(160) NOT NULL,
  mobile VARCHAR(24) NOT NULL,
  assigned_to BIGINT UNSIGNED NULL,
  status ENUM('pending', 'completed', 'in_correction') NOT NULL DEFAULT 'pending',
  findings TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_quality_inspection FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE SET NULL,
  CONSTRAINT fk_quality_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL,
  CONSTRAINT fk_quality_assignee FOREIGN KEY (assigned_to) REFERENCES admins(id) ON DELETE SET NULL,
  INDEX idx_quality_status_date (status, created_at),
  INDEX idx_quality_registration (registration_no)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS repairs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  registration_no VARCHAR(24) NOT NULL,
  customer_name VARCHAR(160) NOT NULL,
  mobile VARCHAR(24) NOT NULL,
  address VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  pincode VARCHAR(12) NOT NULL,
  brand VARCHAR(80) NOT NULL,
  model VARCHAR(100) NOT NULL,
  variant VARCHAR(120) NOT NULL,
  work_type VARCHAR(120) NOT NULL,
  scheduled_date DATE NOT NULL,
  status ENUM('requested', 'scheduled', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'requested',
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_repairs_date_status (scheduled_date, status),
  INDEX idx_repairs_registration (registration_no)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS status_change_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  resource ENUM('inspections', 'quality-checks', 'quick-listings') NOT NULL,
  resource_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(32) NOT NULL,
  to_status VARCHAR(32) NOT NULL,
  note VARCHAR(500) NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  requested_by BIGINT UNSIGNED NOT NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_status_requester FOREIGN KEY (requested_by) REFERENCES admins(id),
  CONSTRAINT fk_status_reviewer FOREIGN KEY (reviewed_by) REFERENCES admins(id) ON DELETE SET NULL,
  INDEX idx_status_requests_review (status, created_at),
  INDEX idx_status_requests_resource (resource, resource_id),
  CONSTRAINT chk_status_request_change CHECK (from_status <> to_status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(100) NOT NULL PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
