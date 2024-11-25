module.exports = {
  selectors: {
    uploadButton: '#select-image-single',
    submitButton: '#submit-work',
    titleEn: '#work_title_en',
    descriptionEn: '#work_description_en',
    tagFieldEn: '#work_tag_field_en',
    workSafeForWorkTrue: '#work_safe_for_work_true',
    rightsDeclaration: '#rightsDeclaration',
    enableAllProducts: '.enable-all',
    // Add other selectors as needed
  },
  urls: {
    login: 'https://www.redbubble.com/fr/auth/login',
    upload: 'https://www.redbubble.com/portfolio/images/new?ref=dashboard',
    // Add other URLs as needed
  },
  paths: {
    cookiePath: './user_data/cookie/session.json',
    userDataDir: './user_data',
    logsDir: './logs',
    doneDir: 'DONE',
    // Add other paths as needed
  }
}; 