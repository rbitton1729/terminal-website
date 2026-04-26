FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html style.css favicon.png favicon.ico tiny.iso paper.pdf /usr/share/nginx/html/
COPY src/ /usr/share/nginx/html/src/
COPY content/ /usr/share/nginx/html/content/
COPY v86/ /usr/share/nginx/html/v86/

EXPOSE 80
