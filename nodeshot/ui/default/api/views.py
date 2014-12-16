from rest_framework.decorators import api_view
from rest_framework.response import Response
from nodeshot.core.nodes.models import Status
from nodeshot.core.cms.models import MenuItem
from nodeshot.core.nodes.serializers import StatusListSerializer
from nodeshot.core.cms.serializers import MenuSerializer


# TODO: rimouovere questa MERDA INUTILE
@api_view(('GET',))
def essential_data(request, format=None):
    """
    Retrieve menu and legend items request.
    """
    status = Status.objects.all()
    menu = MenuItem.objects.published().filter(parent=None).accessible_to(request.user)
    context = {'request': request}
    return Response({
        'status': StatusListSerializer(status, many=True, context=context).data,
        'menu': MenuSerializer(menu, many=True, context=context).data
    })
