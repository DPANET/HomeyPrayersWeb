import nconf from 'nconf';
nconf.file('config/default.json');
process.env.DEBUG = nconf.get("DEBUG");

import mainController from "./controllers/main.controller";
import { App } from "./routes/main.router";

import { Server } from 'http';

async function init(): Promise<void> {
    let app: App;
    try {


        //mongoose.connections.forEach((value)=>value.close());
        app = new App([new mainController()]);


        // let eventProvider:events.ConfigEventProvider = new events.ConfigEventProvider("config/config.json");
        // let eventListener:events.ConfigEventListener = new events.ConfigEventListener();
        // eventProvider.registerListener(eventListener);
        // setTimeout(() => {
        //     app.listen();
        // }, 5000);
        const server:Server =  app.listen();

        process.on('SIGINT', async () => {
            server.close(async () => {
              console.log('Process terminated') 
              process.exit(0);
            });
           
          })
    }
    catch (err) {
        console.log(err)
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