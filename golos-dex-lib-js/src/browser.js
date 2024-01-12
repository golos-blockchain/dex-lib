import GolosDexApi from './GolosDexApi'

if (typeof window !== 'undefined') {
    window.GolosDexApi = GolosDexApi;
}

if (typeof global !== 'undefined') {
    global.GolosDexApi = GolosDexApi;
}

exports = module.exports = GolosDexApi;
