"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const nconf_1 = __importDefault(require("nconf"));
nconf_1.default.file('config/default.json');
process.env.DEBUG = nconf_1.default.get("DEBUG");
const main_controller_1 = __importDefault(require("./controllers/main.controller"));
const main_router_1 = require("./routes/main.router");
async function init() {
    let app;
    try {
        //mongoose.connections.forEach((value)=>value.close());
        app = new main_router_1.App([new main_controller_1.default()]);
        // let eventProvider:events.ConfigEventProvider = new events.ConfigEventProvider("config/config.json");
        // let eventListener:events.ConfigEventListener = new events.ConfigEventListener();
        // eventProvider.registerListener(eventListener);
        // setTimeout(() => {
        //     app.listen();
        // }, 5000);
        const server = app.listen();
        process.on('SIGINT', async () => {
            server.close(async () => {
                console.log('Process terminated');
                process.exit(0);
            });
        });
    }
    catch (err) {
        console.log(err);
    }
    finally {
        // await prayerDBConnection.disconnect();
    }
}
init();
// setTimeout(()=>{doSomething()}, 5000);
// async function  doSomething()
// {        let err:Error, result: any, url: any;
// let queryString: any =
// {
//     uri: 'http://localhost:3005/PrayerManager/PrayersAdjustments/',
//     method: 'GET',
//     json: true,
//     resolveWithFullResponse: false
// };
// [err, result] = await to(request.get(queryString));
// console.log(result);
// console.log("Error: "+err);
// }
//# sourceMappingURL=app.js.map