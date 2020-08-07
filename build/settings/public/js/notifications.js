import Noty from "noty";
export function notify(type, message) {
    let noty = loadNotification();
    noty.setType(type, true);
    noty.setText(message, true);
    noty.show();
}
export function loadNotification() {
    return new Noty({
        layout: 'top',
        theme: "bootstrap-v4",
        type: "error",
        text: 'Test Hi',
        force: false,
        timeout: false,
        progressBar: false,
        animation: {
            open: 'animated slideInDown',
            close: 'animated slideOutUp' // Animate.css class names
        },
        closeWith: ['click', 'button'],
        modal: false,
        killer: false,
    });
}
//# sourceMappingURL=notifications.js.map