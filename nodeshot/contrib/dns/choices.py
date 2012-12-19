from django.utils.translation import ugettext_lazy as _

ACCESS_LEVELS = (
    ('owner', _('owner')),
    ('manager', _('manager'))
)

DOMAIN_TYPE = (
    'NATIVE',
    'MASTER',
    'SLAVE',
    'SUPERSLAVE'
)

RECORD_TYPE = ( #All possible dns record types
    'A',
    'AAAA',
    'AFSDB',
    'CERT',
    'CNAME',
    'DNSKEY',
    'DS',
    'HINFO',
    'KEY',
    'LOC',
    'MX',
    'NAPTR',
    'NS',
    'NSEC',
    'PTR',
    'RP',
    'RRSIG',
    'SOA',
    'SPF',
    'SSHFP',
    'SRV',
    'TXT'
)

USER_RECORD_TYPE = ( #User-allowed record types
    'A',
    'AAAA',
    'CNAME',
    'MX'
)
