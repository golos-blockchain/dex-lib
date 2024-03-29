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
            console.warn('GolosDexApi initialized without golos library. apidexExchange/getExchange will not work.')
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

    getExchange = async (query) => {
        const { node, ...rest } = query

        if (!this.golos) {
            throw new Error('getExchange not supported - GolosDexApi initialized without golos-lib-js')
        }

        let eapi = this.golos.api
        if (!eapi || !eapi.getExchange) {
            throw new Error('golos-lib-js is too old. To support getExchange it should be at least >=0.9.66')
        }
        if (node) {
            eapi = new eapi.Golos()
            eapi.setWebSocket(node)
        }

        return await eapi.getExchange(rest)
    }

    ORDER_MAX_EXPIRATION = 0xffffffff

    makeOrderID = () => {
        return Math.floor(Date.now() / 1000)
    }

    makeExchangeTx = async (exchangeSteps, opts) => {
        if (!this.golos) {
            throw new Error('makeExchangeTx not supported - GolosDexApi initialized without golos-lib-js')
        }
        const { Asset, Price } = this.golos.utils
        if (!Asset || !Price) {
            throw new Error('golos-lib-js is too old. Recommended is >=0.9.31')
        }

        const defOpts = {
            op_type: 'limit_order_create',
            orderid: (op, i, ops, step) => {
                return this.makeOrderID()
            }
        }
        opts = {...defOpts, ...opts}

        const ops = []
        let i = 0
        for (const step of exchangeSteps) {
            const op = {}

            const copyField = (key, defVal) => {
                if (key in opts) {
                    if (opts[key] !== undefined) {
                        op[key] = opts[key]
                    }
                } else if (defVal !== undefined) {
                    op[key] = defVal
                }
            }

            copyField('owner')
            if ('orderid' in opts) op.orderid = opts.orderid

            op.amount_to_sell = step.sell

            const prc = await new Price(step.limit_price)
            op.min_to_receive = Asset(step.sell).mul(prc).toString()

            copyField('fill_or_kill', false)

            op.expiration = opts.expiration || this.ORDER_MAX_EXPIRATION

            if (isFunction(opts.orderid)) {
                op.orderid = await opts.orderid(op, i++, ops, step)
            }

            ops.push([opts.op_type, op])
        }
        return ops
    }
}

export default GolosDexApi
