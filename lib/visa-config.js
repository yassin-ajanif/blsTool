/**
 * Centralized Visa Configuration
 * Edit only this file to update all visa types, locations, and categories
 */

const VISA_CONFIG = {
  // Application categories (same for all countries)
  categories: ['Normal', 'Premium', 'Prime Time'],

  // Country configurations
  countries: {
    Spain: {
      locations: ['Tetouan', 'Nador', 'Agadir', 'Rabat', 'Tangier', 'Casablanca'],

      // Visa types order (Casablanca has different order)
      visaTypeOrder: {
        default: ['National Visa', 'Schengen Visa'],
        Casablanca: ['Schengen Visa', 'National Visa']
      },

      // Visa subtypes by location and type
      visaSubtypes: {
        Tetouan: {
          'Schengen Visa': ['Schengen Visa'],
          'National Visa': ['']
        },
        Nador: {
          'Schengen Visa': ['Schengen Visa'],
          'National Visa': ['']
        },
        Agadir: {
          'Schengen Visa': ['Schengen Visa'],
          'National Visa': ['Non-university students']
        },
        Tangier: {
          'Schengen Visa': ['Schengen Visa'],
          'National Visa': ['Students Less than 6 Months (SSU).']
        },
        Rabat: {
          'Schengen Visa': [
            'Schengen Visa',
            'Schengen Visa - With prior Spain Visa 2024',
            'Schengen Visa – With Prior Schengen Visa 2023'
          ],
          'National Visa': [
            'Students - Language/selectivity',
            'Students - Non-tertiary studies',
            'Students - Graduate studies',
            'Student - Others'
          ]
        },
        Casablanca: {
          'Schengen Visa': ['Casa 1', 'Casa 2', 'Casa 3'],
          'National Visa': [
            'Student visa',
            'Family reunification visa',
            'National Visa',
            'Work Visa'
          ]
        }
      }
    },

    Portugal: {
      locations: ['Rabat', 'Casablanca'],

      // Portugal has same visa types for all locations
      visaTypes: ['Short Stay Visa', 'Long Stay Visa'],

      // Visa subtypes by location and type
      visaSubtypes: {
        Rabat: {
          'Short Stay Visa': [
            "AIRPORT TRANSIT",
            "Business or other professional reason",
            "Business Visa",
            "CULTURAL",
            "Cultural Event Sports or Artistic",
            "Family Member of EU and EEA Nationals",
            "Family Member of EU Citizen - Directive 2004/38/EC",
            "MEDICAL REASONS",
            "OFFICIAL VISIT",
            "Road Drivers",
            "Schengen Visa",
            "SPORTS",
            "Spouse of Portuguese citizen for a short visit to Portugal",
            "Spouse Visa",
            "STUDY",
            "Study Culture Sport Events",
            "TOURISM",
            "Tourism or any other reason to travel",
            "Tourist Visa",
            "Transit Visa",
            "Visit Friends/Family"
          ],
          'Long Stay Visa': [
            'Any other category of Long-Stay visa',
            'DIGITAL NOMADS WORK. REMOTE',
            'Employment Visa',
            'EU MOBILITY HIGHER EDUCATION',
            'Family Member',
            'Family Member of Portuguese Citizen for family reunification',
            'FAMILY REGROUPING',
            'Family Reunification',
            'FAMILY VISA APPLICANT',
            'HIGH EDUCATION ORDINANCE 111/2019',
            'Highly Qualified Activity',
            'INVESTIGATOR',
            'Investor visa',
            'Job search',
            'Long Stay Visa D2',
            'Long Stay Visa D3',
            'Long Stay Visa D4',
            'Long Stay Visa D5',
            'Long Stay Visa D7',
            'MEDICAL COMPANION',
            'MOBILITY EU RESEARCH',
            'National Visa',
            'OTHER',
            'Professional Visa',
            'RESIDENCE',
            'SECONDARY SCHOOL STUDENT',
            'Student Visa',
            'Studies',
            'STUDY NATIONAL VISAS',
            'UNIVERSITY EDUCATION STUDENT',
            'VOLUNTARY',
            'Work',
            'WORKING HOLIDAY'
          ]
        },
        Casablanca: {
          'Short Stay Visa': [
            'AIRPORT TRANSIT',
            'Business or other professional reason',
            'Business Visa',
            'CULTURAL',
            'Cultural Event / Sports or Artistic',
            'Family Member of EU and EEA Nationals',
            'Family Member of EU Citizen - Directive 2004/38/EC',
            'MEDICAL REASONS',
            'OFFICIAL VISIT',
            'OTHER',
            'Road Drivers',
            'Schengen Visa',
            'SPORTS',
            'Spouse of Portuguese citizen for a short visit to Portugal',
            'Spouse Visa',
            'STUDY',
            'Study / Culture / Sport / Events',
            'Tourism',
            'Tourist Visa',
            'TRANSIT',
            'Visit Friends / Family'
          ],
          'Long Stay Visa': [
            'Any other category of Long-Stay visa',
            'DIGITAL NOMADS WORK. REMOTE',
            'Employment Visa',
            'EU MOBILITY HIGHER EDUCATION',
            'Family Member',
            'Family Member of Portuguese Citizen for family reunification',
            'FAMILY REGROUPING',
            'Family Reunification',
            'FAMILY VISA APPLICANT',
            'HIGH EDUCATION ORDINANCE 111/2019',
            'Highly Qualified Activity',
            'INVESTIGATOR',
            'Investor visa',
            'Job search',
            'Long Stay Visa D2',
            'Long Stay Visa D3',
            'Long Stay Visa D4',
            'Long Stay Visa D5',
            'Long Stay Visa D7',
            'MEDICAL COMPANION',
            'MOBILITY EU RESEARCH',
            'National Visa',
            'OTHER',
            'Professional Visa',
            'RESIDENCE',
            'SECONDARY SCHOOL STUDENT',
            'Student Visa',
            'Studies',
            'STUDY NATIONAL VISAS',
            'UNIVERSITY EDUCATION STUDENT',
            'VOLUNTARY',
            'Work',
            'WORKING HOLIDAY'
          ]
        }
      }
    }
  },

  // Login URLs by country
  loginUrls: {
    Portugal: 'https://morocco.blsportugal.com/MAR/account/login',
    Spain: 'https://www.blsspainmorocco.net/MAR/account/login'
  }
};

/**
 * Visa Configuration API
 */
class VisaConfiguration {
  constructor() {
    this.config = VISA_CONFIG;
  }

  // Get all countries
  getCountries() {
    return Object.keys(this.config.countries);
  }

  // Get locations for a country
  getLocationsByCountry(country) {
    return this.config.countries[country]?.locations || [];
  }

  // Get categories
  getCategories() {
    return this.config.categories;
  }

  // Get visa types for country and location
  getVisaTypes(country, location) {
    const countryConfig = this.config.countries[country];
    if (!countryConfig) return [];

    // Portugal has the same types for all locations
    if (country === 'Portugal') {
      return countryConfig.visaTypes;
    }

    // Spain has different order for Casablanca
    if (country === 'Spain') {
      return location === 'Casablanca'
        ? countryConfig.visaTypeOrder.Casablanca
        : countryConfig.visaTypeOrder.default;
    }

    return [];
  }

  // Get visa subtypes
  getVisaSubtypes(country, location, visaType) {
    const countryConfig = this.config.countries[country];
    if (!countryConfig) return [];

    const locationSubtypes = countryConfig.visaSubtypes[location];
    if (!locationSubtypes) return [];

    return locationSubtypes[visaType] || [];
  }

  // Find visa subtype with case-insensitive matching
  findVisaSubtype(country, location, visaType, searchSubtype) {
    if (!searchSubtype) return null;

    const subtypes = this.getVisaSubtypes(country, location, visaType);
    const searchLower = searchSubtype.toLowerCase().trim();

    // Try exact match first (case-insensitive)
    const exactMatch = subtypes.find(subtype =>
      subtype.toLowerCase().trim() === searchLower
    );
    if (exactMatch) return exactMatch;

    // Try partial match (contains)
    const partialMatch = subtypes.find(subtype =>
      subtype.toLowerCase().includes(searchLower) ||
      searchLower.includes(subtype.toLowerCase())
    );

    return partialMatch || null;
  }

  // Validate visa configuration with case-insensitive matching
  validateVisaConfig(country, location, visaType, visaSubtype) {
    // Check country (case-insensitive)
    const validCountry = this.getCountries().find(c =>
      c.toLowerCase() === country.toLowerCase()
    );
    if (!validCountry) {
      return { valid: false, error: `Invalid country: ${country}` };
    }

    // Check location (case-insensitive)
    const locations = this.getLocationsByCountry(validCountry);
    const validLocation = locations.find(l =>
      l.toLowerCase() === location.toLowerCase()
    );
    if (!validLocation) {
      return { valid: false, error: `Invalid location for ${country}: ${location}` };
    }

    // Check visa type (case-insensitive)
    const visaTypes = this.getVisaTypes(validCountry, validLocation);
    const validVisaType = visaTypes.find(vt =>
      vt.toLowerCase() === visaType.toLowerCase()
    );
    if (!validVisaType) {
      return { valid: false, error: `Invalid visa type for ${country}/${location}: ${visaType}` };
    }

    // Check visa subtype (case-insensitive)
    const visaSubtypes = this.getVisaSubtypes(validCountry, validLocation, validVisaType);
    if (visaSubtypes.length > 0 && visaSubtype) {
      const validSubtype = this.findVisaSubtype(validCountry, validLocation, validVisaType, visaSubtype);
      if (!validSubtype) {
        return { valid: false, error: `Invalid visa subtype: ${visaSubtype}` };
      }
    }

    return { valid: true };
  }

  // Validate category
  validateCategory(category) {
    return this.config.categories.includes(category);
  }

  // Get login URL for country
  getLoginUrl(country) {
    return this.config.loginUrls[country] || this.config.loginUrls.Spain;
  }
}

// Create singleton instance
const visaConfig = new VisaConfiguration();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VisaConfiguration;
}