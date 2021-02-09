Promise = require('bluebird') // eslint-disable-line
const _ = require('lodash')
const moment = require('moment')
const rp = require('request-promise')
const prompt = require('prompt')
const colors = require('colors/safe')

// const startDate = '2021-10-29'
// const endDate = '2021-12-29'
// const from = 'IST_SAW'
// const to = 'LWO'
// const min_stay = 3
// const max_stay = 15

async function searchFlight (from, to, date) {
    const searchData = {
        "flightSearchList": [
            {
                "arrivalPort": to,
                "departurePort": from,
                "departureDate": date
            }
        ],
        "dateOption": 1,
        "adultCount": 1,
        "childCount": 0,
        "infantCount": 0,
        "soldierCount": 0,
        "currency": "TL",
        "operationCode": "TK",
        "ffRedemption": false,
        "personnelFlightSearch": false
    }
    try {
        const data = await rp({
            method: 'POST',
            url: 'https://mw.flypgs.com/pegasus/availability',
            body: JSON.stringify(searchData),
            headers: {
            'Accept-Language': 'en',
            'x-platform': 'android',
            'X-VERSION': '2.16.0',
            'X-SYSTEM-VERSION': '5.1',
            'Content-Type': 'application/json'
            }
        })
        const response = JSON.parse(data)
        const cheapestFlights = response.departureRouteList[0].dailyFlightList
        .filter(df => df.cheapestFare)
        .map(df => {
            return {
                date: df.date,
                cheapest: df.cheapestFare.amount,
                doy: moment(df.date).dayOfYear()
            }
        })
        return cheapestFlights
    } catch (error) {
        console.error(error)
        console.error(error.response.data)
    }
    
}

const schema = {
    properties: {
        from: {
            required: true,
            description: 'Where are you travelling from (like IST, LWO)'
        },
        to: {
            required: true,
            description: 'Where will be your destination (like IST, LWO)'
        },
        startDate: {
            required: true,
            description: 'When your travel-period starts (YYYY-MM-DD)',
            default: moment().add(4, 'days').format('YYYY-MM-DD')
        },
        endDate: {
            required: true,
            description: 'When your travel-period ends (YYYY-MM-DD)',
            default: moment().add(1, 'months').format('YYYY-MM-DD')
        },
        min_stay: {
            required: true,
            type: 'integer',
            description: 'How long is your minimum stay (days)',
            default: 3
        },
        max_stay: {
            required: true,
            type: 'integer',
            description: 'How long is your maximum stay (days)',
            default: 15
        }
    }
}


async function main () {
    prompt.message = colors.green("Question");
    prompt.start()
    const {startDate, endDate, from, to, min_stay, max_stay} = await prompt.get(schema);

    const searchDates = []
    const momentStart = moment(startDate)
    const momentEnd = moment(endDate)

    const doyStart = momentStart.dayOfYear()
    const doyEnd = momentEnd.dayOfYear()

    for (let i = doyStart; i <= doyEnd; i += 3) {
        searchDates.push(moment().dayOfYear(i))
    }

    const allResults = _.flatten(await Promise.map(searchDates, searchDate => {
        const dateStr = searchDate.format('YYYY-MM-DD')
        return searchFlight(from, to, dateStr)
    }, { concurrency: 16 }))

    const allResultsReturn = _.flatten(await Promise.map(searchDates, searchDate => {
        const dateStr = searchDate.format('YYYY-MM-DD')
        return searchFlight(to, from, dateStr)
    }, { concurrency: 16 }))

    const trips = []
    allResults.forEach(ar => {
        const returns = allResultsReturn.filter(rev => {
            const stayDiff = rev.doy - ar.doy
            if (stayDiff < min_stay) {
                return false
            }
            if (stayDiff > max_stay) {
                return false
            }
            return true
        })
        .map(r => {
            return {
                ...r,
                totalTrip: r.cheapest + ar.cheapest
            }
        })

        returns.forEach(r => {
            trips.push({
                totalStay: r.doy - ar.doy,
                departureDate: ar.date,
                returnDate: r.date,
                departureCost: ar.cheapest,
                returnCost: r.cheapest,
                totalCost: ar.cheapest + r.cheapest
            })
        })
    })

    const bestTrips = _.orderBy(trips, ['totalCost'], ['asc'])
    console.table(bestTrips.splice(0, 30))
}

main()
