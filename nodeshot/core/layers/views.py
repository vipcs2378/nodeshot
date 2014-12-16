from django.http import Http404
from django.utils.translation import ugettext_lazy as _

from rest_framework import generics, permissions, authentication
from rest_framework.response import Response

from nodeshot.core.base.mixins import ListSerializerMixin
from nodeshot.core.base.utils import Hider
from nodeshot.core.nodes.views import NodeList
from nodeshot.core.nodes.serializers import NodeGeoSerializer

from .settings import REVERSION_ENABLED
from .models import Layer
from .serializers import *


if REVERSION_ENABLED:
    from nodeshot.core.base.mixins import RevisionCreate, RevisionUpdate

    class LayerListBase(RevisionCreate, generics.ListCreateAPIView):
        pass

    class LayerDetailBase(RevisionUpdate, generics.RetrieveUpdateAPIView):
        pass
else:
    class LayerListBase(generics.ListCreateAPIView):
        pass

    class LayerDetailBase(generics.RetrieveUpdateAPIView):
        pass


class LayerList(LayerListBase):
    """
    Retrieve list of all layers.

    ### POST

    Create new layer if authorized (admins and allowed users only).
    """
    queryset = Layer.objects.published()
    permission_classes = (permissions.DjangoModelPermissionsOrAnonReadOnly, )
    authentication_classes = (authentication.SessionAuthentication,)
    serializer_class = LayerListSerializer
    pagination_serializer_class = PaginatedLayerListSerializer
    paginate_by_param = 'limit'
    paginate_by = None

layer_list = LayerList.as_view()


class LayerDetail(LayerDetailBase):
    """
    Retrieve details of specified layer.

    ### PUT & PATCH

    Edit specified layer
    """
    permission_classes = (permissions.DjangoModelPermissionsOrAnonReadOnly, )
    authentication_classes = (authentication.SessionAuthentication,)
    queryset = Layer.objects.published()
    serializer_class = LayerDetailSerializer
    lookup_field = 'slug'

layer_detail = LayerDetail.as_view()


class LayerNodesList(ListSerializerMixin, NodeList):
    """
    Retrieve list of nodes of the specified layer

    Parameters:

     * `search=<word>`: search <word> in name of nodes of specified layer
     * `limit=<n>`: specify number of items per page (defaults to 40)
     * `layerinfo`: true shows layer description and other info, false doesn't (defaults to true)
    """
    layer = None
    layer_info_default = True  # show layer info by default

    def get_layer(self):
        """ retrieve layer from DB """
        if self.layer:
            return
        try:
            self.layer = Layer.objects.get(slug=self.kwargs['slug'])
        except Layer.DoesNotExist:
            raise Http404(_('Layer not found'))

    def get_queryset(self):
        """ extend parent class queryset by filtering nodes of the specified layer """
        self.get_layer()
        return super(LayerNodesList, self).get_queryset().filter(layer_id=self.layer.id)

    def get_nodes(self, request, *args, **kwargs):
        """ this method might be overridden by other modules (eg: nodeshot.interop.sync) """
        # ListSerializerMixin.list returns a serializer object
        return (self.list(request, *args, **kwargs)).data

    def get(self, request, *args, **kwargs):
        """ Retrieve list of nodes of the specified layer """
        self.get_layer()

        # get nodes of layer
        nodes = self.get_nodes(request, *args, **kwargs)

        # determine if layer info should be shown
        layer_info_default = str(self.layer_info_default).lower()  # convert boolean to string ("true" or "false")
        show_layer_info = (self.request.QUERY_PARAMS.get('layerinfo', layer_info_default) == 'true')  # is the get param true? if not is false

        # if layerinfo GET param is true show info about layer
        if show_layer_info:
            content = LayerNodeListSerializer(self.layer, context=self.get_serializer_context()).data
            content['nodes'] = self.get_nodes(request, *args, **kwargs)
        # otherwise just output nodes in GeoJSON format
        else:
            content = nodes

        return Response(content)

    post = Hider()

nodes_list = LayerNodesList.as_view()


class LayerNodesGeoJSONList(LayerNodesList):
    """
    Retrieve list of nodes of the specified layer in GeoJSON format.

    Parameters:

     * `search=<word>`: search <word> in name, slug, description and address of nodes
     * `limit=<n>`: specify number of items per page (defaults to 40)
     * `layerinfo`: true shows layer description and other info, false doesn't (defaults to false)
    """
    serializer_class = NodeGeoSerializer
    paginate_by = 0
    layer_info_default = False  # don't show layer info by default

    def get(self, request, *args, **kwargs):
        """ Retrieve list of nodes of the specified layer in GeoJSON format. """
        # overwritten just to tweak the docstring for auto documentation purposes
        return super(LayerNodesGeoJSONList, self).get(request, *args, **kwargs)

nodes_geojson_list = LayerNodesGeoJSONList.as_view()


class LayerGeoJSONList(generics.ListAPIView):
    """
    Retrieve list of layers in GeoJSON format.
    Parameters:

     * `limit=<n>`: specify number of items per page (defaults to 40)
     * `page=<n>`: show page n
    """
    pagination_serializer_class = PaginatedGeojsonLayerListSerializer
    paginate_by_param = 'limit'
    paginate_by = 40
    serializer_class = GeoLayerListSerializer
    queryset = Layer.objects.published().exclude(area__isnull=True)

layers_geojson_list = LayerGeoJSONList.as_view()
