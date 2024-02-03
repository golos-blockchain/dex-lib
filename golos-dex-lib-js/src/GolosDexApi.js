import fetchEx from './fetchEx'

const defOpts = {
    host: 'https://api-dex.golos.app',
    patch_golos: true
}

const request_base = {
    method: 'get',
    headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
    }
}

class GolosDexApi {
    constructor(golosOrOpts, opts) {
        if (golosOrOpts && golosOrOpts.config && golosOrOpts.config.set) {
            this.golos = golosOrOpts
            opts = {...defOpts, ...opts}
        } else if (golosOrOpts) {
            opts = {...defOpts, ...golosOrOpts}
        } else {
            opts = {...defOpts}
        }
        if (opts.golos) this.golos = opts.golos
        if (!this.golos) {
            this.golos = typeof('window') !== undefined && window.golos
        }
        if (!this.golos) {
            this.golos = typeof('global') !== undefined && global.golos
        }
        if (!this.golos) {
            console.warn('GolosDexApi initialized without golos library. apidexExchange will not work.')
        }
        this.opts = opts
        if (this.golos && opts.patch_golos) {
            this.golos.dexapi = this
        }
    }

    apidexUrl = (pathname) => {
        try {
            const host = (this.golos && this.golos.config.get('apidex.host')) || this.opts.host
            return new URL(pathname, host).toString();
        } catch (err) {
            console.error('apidexUrl', err)
            return ''
        }
    }

    apidexAvailable = () => {
        return !!this.apidexUrl('/')
    }

    pageBaseURL = 'https://coinmarketcap.com/currencies/'

    getPageURL = (slug) => {
        return new URL(slug + '/', this.pageBaseURL).toString()
    }

    cached = {}

    apidexGetPrices = async (sym) => {
        const empty = {
            price_usd: null,
            price_rub: null,
            page_url: null
        }
        if (!this.apidexAvailable()) return empty
        let request = Object.assign({}, request_base)
        try {
            const now = new Date()
            const cache = this.cached[sym]
            if (cache && (now - cache.time) < 60000) {
                return cache.resp
            } else {
                let resp = await fetchEx(this.apidexUrl(`/api/v1/cmc/${sym}`), {
                    ...request,
                    timeout: 2000
                })
                resp = await resp.json()
                if (resp.data && resp.data.slug)
                    resp['page_url'] = this.getPageURL(resp.data.slug)
                else
                    resp['page_url'] = null
                this.cached[sym] = {
                    resp, time: now
                }
                return resp
            }
        } catch (err) {
            console.error('apidexGetPrices', err)
            return empty
        }
    }

    cachedAll = {}

    apidexGetAll = async () => {
        const empty = {
            data: {}
        }
        if (!this.apidexAvailable()) return empty
        let request = Object.assign({}, request_base)
        try {
            const now = new Date()
            if (this.cachedAll && (now - this.cachedAll.time) < 60000) {
                return this.cachedAll.resp
            } else {
                let resp = await fetchEx(this.apidexUrl(`/api/v1/cmc`), {
                    ...request,
                    timeout: 1000
                })
                resp = await resp.json()
                this.cachedAll = {
                    resp, time: now
                }
                return resp
            }
        } catch (err) {
            console.error('apidexGetAll', err)
            return empty
        }
    }

    apidexExchange = async (sell, buySym, direction = 'sell') => {
        if (!this.golos) {
            console.error('apidexExchange not supported - GolosDexApi initialized without golos-lib-js')
            return null
        }
        const { Asset, Price } = this.golos.utils
        if (!Asset || !Price) {
            console.error('golos-lib-js is too old. Recommended is >=0.9.31')
        }

        if (!this.apidexAvailable()) return null
        let request = Object.assign({}, request_base)
        try {
            let resp = await fetchEx(this.apidexUrl(`/api/v1/exchange/` + sell.toString() + '/' + buySym + '/' + direction), {
                ...request,
                timeout: 2000
            })
            resp = await resp.json()
            if (resp.result) {
                resp.result = await Asset(resp.result)
            }
            if (resp.best_price) {
                resp.best_price = await Price(resp.best_price)
            }
            if (resp.limit_price) {
                resp.limit_price = await Price(resp.limit_price)
            }
            if (resp.remain) {
                resp.remain = await Asset(resp.remain)
            }
            return resp
        } catch (err) {
            console.error('apidexExchange', err)
            return null
        }
    }
}

export default GolosDexApi
