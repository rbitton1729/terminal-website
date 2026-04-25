FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html style.css boot.js favicon.png favicon.ico tiny.iso /usr/share/nginx/html/
COPY v86/ /usr/share/nginx/html/v86/

EXPOSE 80
