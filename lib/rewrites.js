module.exports = [
    {from: '/static/*', to: 'static/*'},
    {from: '/templates/*', to: 'templates/*'},
    {from: '/status', to: '_show/status'},
    require('app-settings/rewrites'),
    {from: '/', to: '_show/inbox'},
    {from: '#/*', to: '_show/inbox'},
    {from: '/#/*', to: '_show/inbox'},
    {from: '/migration', to: '_show/migration'},
    {from: '*', to: '_show/not_found'},
];
