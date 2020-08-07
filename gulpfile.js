var gulp        = require('gulp');
var browserSync = require('browser-sync').create();
var sass        = require('gulp-sass');
var sourcemaps  = require('gulp-sourcemaps');
//var ts = require('gulp-typescript');
const config = require('nconf');
config.file('config/default.json');

var port  = config.get('PORT');
var browserPort = config.get('BROWSER_PORT');

// Compile sass into CSS & auto-inject into browsers
async function sassCSS() {
    return await gulp.src(['node_modules/bootstrap/scss/bootstrap.scss', 'src/scss/*.scss'])
        .pipe(sass())
        .pipe(gulp.dest("src/css"))
        .pipe(browserSync.stream());
};
async function css()
{
    return await gulp.src('settings/public/css/*.css')
    .pipe( browserSync.stream());

}

// Move the javascript files into our /src/js folder
 async function js () {
    return await gulp.src(['build/web_module/**/*'])
        .pipe(gulp.dest("settings/js"))
        .pipe(browserSync.stream());
};
// Starts a BrowerSync instance

// Static Server + watching scss/html files
 async function serve (cb) {

    await browserSync.init(null,{
        files: ["../settings/"],
        proxy: "http://localhost:" + port,
        port: browserPort
    });

   // await gulp.watch(['node_modules/bootstrap/scss/bootstrap.scss', 'src/scss/*.scss'], sassCSS);
    await gulp.watch(['settings/public/css/*.css'], css);
    await gulp.watch(["settings/views/*.html","settings/public/js/*.js","settings/*.html","settings/public/css/*.css","**/build/**/*"]).on('change',(path,stats)=> browserSync.reload());
};

exports.default = gulp.series(serve);
