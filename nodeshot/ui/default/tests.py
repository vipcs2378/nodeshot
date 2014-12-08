import json
from time import sleep

from django.core.urlresolvers import reverse
from django.test import TestCase
from django.conf import settings

from nodeshot.core.base.tests import user_fixtures
from nodeshot.core.nodes.models import Node
from nodeshot.ui.default import settings as local_settings

from selenium import webdriver
from selenium.webdriver.support.ui import WebDriverWait
from selenium.common.exceptions import WebDriverException
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains


def ajax_complete(driver):
    try:
        return driver.execute_script("return jQuery.active == 0")
    except WebDriverException:
        pass


class DefaultUiTest(TestCase):
    fixtures = [
        'initial_data.json',
        user_fixtures,
        'test_layers.json',
        'test_status.json',
        'test_nodes.json',
        'test_images.json'
    ]

    INDEX_URL = '%s%s' % (settings.SITE_URL, reverse('ui:index'))

    def _hashchange(self, hash):
        self.browser.get('%s%s' % (self.INDEX_URL, hash))
        WebDriverWait(self.browser, 10).until(ajax_complete, 'Timeout')

    @classmethod
    def setUpClass(cls):
        cls.browser = webdriver.Firefox()
        cls.browser.get(cls.INDEX_URL)
        super(DefaultUiTest, cls).setUpClass()

    @classmethod
    def tearDownClass(cls):
        cls.browser.quit()
        super(DefaultUiTest, cls).tearDownClass()
    
    def setUp(self):
        self.browser.execute_script('localStorage.clear()')

    def test_index(self):
        response = self.client.get(reverse('ui:index'))
        self.assertEqual(response.status_code, 200)

    def test_essential_data(self):
        response = self.client.get(reverse('api_ui_essential_data'))
        self.assertEqual(response.status_code, 200)
        self.assertIn('status', response.data)
        self.assertIn('menu', response.data)

    def test_social_auth_optional(self):
        # enable social auth
        setattr(local_settings, 'SOCIAL_AUTH_ENABLED', True)
        response = self.client.get(reverse('ui:index'))
        self.assertContains(response, 'social-buttons')
        # disable social auth
        setattr(local_settings, 'SOCIAL_AUTH_ENABLED', False)
        response = self.client.get(reverse('ui:index'))
        self.assertNotContains(response, 'social-buttons')

    def test_facebook_optional(self):
        setattr(local_settings, 'SOCIAL_AUTH_ENABLED', True)
        setattr(local_settings, 'FACEBOOK_ENABLED', True)
        response = self.client.get(reverse('ui:index'))
        self.assertContains(response, 'btn-facebook')
        setattr(local_settings, 'FACEBOOK_ENABLED', False)
        response = self.client.get(reverse('ui:index'))
        self.assertNotContains(response, 'btn-facebook')
        setattr(local_settings, 'SOCIAL_AUTH_ENABLED', False)

    def test_google_optional(self):
        setattr(local_settings, 'SOCIAL_AUTH_ENABLED', True)
        setattr(local_settings, 'GOOGLE_ENABLED', True)
        response = self.client.get(reverse('ui:index'))
        self.assertContains(response, 'btn-google')
        setattr(local_settings, 'GOOGLE_ENABLED', False)
        response = self.client.get(reverse('ui:index'))
        self.assertNotContains(response, 'btn-google')
        setattr(local_settings, 'SOCIAL_AUTH_ENABLED', False)

    def test_github_optional(self):
        setattr(local_settings, 'SOCIAL_AUTH_ENABLED', True)
        setattr(local_settings, 'GITHUB_ENABLED', True)
        response = self.client.get(reverse('ui:index'))
        self.assertContains(response, 'btn-github')
        setattr(local_settings, 'GITHUB_ENABLED', False)
        response = self.client.get(reverse('ui:index'))
        self.assertNotContains(response, 'btn-github')
        setattr(local_settings, 'SOCIAL_AUTH_ENABLED', False)

    def test_home(self):
        self._hashchange('#')
        self.assertEqual(self.browser.find_element_by_css_selector('article.center-stage h1').text, 'Home')

    def test_menu_already_active(self):
        self._hashchange('#')
        # ensure clicking multiple times on a level1 menu item  still displays it as active
        self.browser.find_element_by_css_selector('#nav-bar li.active a').click()
        self.browser.find_element_by_css_selector('#nav-bar li.active a').click()
        # ensure the same on a nested menu item
        self.browser.find_element_by_css_selector('#nav-bar a.dropdown-toggle').click()
        self.browser.find_element_by_css_selector("a[href='#/pages/about']").click()
        self.browser.find_element_by_css_selector('#nav-bar li.active a.dropdown-toggle').click()
        self.browser.find_element_by_css_selector("a[href='#/pages/about']").click()
        self.browser.find_element_by_css_selector('#nav-bar li.active a.dropdown-toggle').click()

    def test_map(self):
        self._hashchange('#/map')
        browser = self.browser
        
        # basic test
        LEAFLET_MAP = 'Nodeshot.body.currentView.map.currentView.map'
        self.assertTrue(browser.execute_script("return Nodeshot.body.currentView.$el.attr('id') == 'map-container'"))
        browser.find_element_by_css_selector('#map-js.leaflet-container')
        self.assertTrue(browser.execute_script("return %s._leaflet_id > -1" % LEAFLET_MAP))
        
        # layers control
        browser.find_element_by_css_selector('#map-js .leaflet-control-layers-list')
        LAYERS_CONTROLS = 'return _.values(%s.layerscontrol._layers)' % LEAFLET_MAP
        self.assertEqual(browser.execute_script('%s[0].name' % LAYERS_CONTROLS), 'Map')
        self.assertEqual(browser.execute_script('%s[1].name' % LAYERS_CONTROLS), 'Satellite')
        
        # ensure coordinates are correct
        self.assertEqual(browser.execute_script("return %s.getZoom()" % LEAFLET_MAP), local_settings.MAP_ZOOM)
        # leaflet coordinates are approximated when zoom is low, so let's check Nodeshot JS settings
        self.assertEqual(browser.execute_script("return Nodeshot.MAP_CENTER"), local_settings.MAP_CENTER)
        
        # ensure rememberCoordinates() works
        browser.execute_script("%s.setView([42.111111, 12.111111], 17)" % LEAFLET_MAP)
        sleep(0.5)
        self._hashchange('#')
        self.assertEqual(browser.execute_script("return localStorage.mapLat.substr(0, 8)"), "42.11111")
        self.assertEqual(browser.execute_script("return localStorage.mapLng.substr(0, 8)"), "12.11111")
        self.assertEqual(browser.execute_script("return localStorage.mapZoom"), "17")
        self._hashchange('#/map')
        self.assertEqual(browser.execute_script("return %s.getZoom()" % LEAFLET_MAP), 17)
        self.assertEqual(browser.execute_script("return %s.getCenter().lat.toString().substr(0, 8)" % LEAFLET_MAP), "42.11111")
        self.assertEqual(browser.execute_script("return %s.getCenter().lng.toString().substr(0, 8)" % LEAFLET_MAP), "12.11111")
        
        # map is resized when window is resized
        window_size = browser.get_window_size()
        map_size = {}
        map_size['width'] = browser.execute_script("return $('#map-js').width()")
        map_size['height'] = browser.execute_script("return $('#map-js').height()")
        browser.set_window_size(window_size['width']-10, window_size['height']-10)
        self.assertEqual(browser.execute_script("return $('#map-js').width()"), map_size['width']-10)
        self.assertEqual(browser.execute_script("return $('#map-js').height()"), map_size['height']-10)
        browser.set_window_size(window_size['width'], window_size['height'])
        self.assertEqual(browser.execute_script("return $('#map-js').width()"), map_size['width'])
        self.assertEqual(browser.execute_script("return $('#map-js').height()"), map_size['height'])

    def test_map_toolbar(self):
        self._hashchange('#/map')
        browser = self.browser
        
        # ensure rendered
        self.assertGreater(len(browser.find_elements_by_css_selector('#map-toolbar a')), 4)
        self.assertEqual(len(browser.find_elements_by_css_selector('#map-toolbar')), 1)
        
        # open search address panel
        panel = browser.find_element_by_css_selector('#fn-search-address')
        button = browser.find_element_by_css_selector('#map-toolbar .icon-search')
        self.assertFalse(panel.is_displayed())
        button.click()
        self.assertTrue(panel.is_displayed())
        # perform search
        input = browser.find_element_by_css_selector('#fn-search-address input')
        submit = browser.find_element_by_css_selector('#fn-search-address button')
        input.send_keys('Via Silvio Pellico, Pomezia, Italy')
        submit.click()
        WebDriverWait(browser, 5).until(ajax_complete, 'Search address timeout')
        sleep(5)
        self.assertEqual(browser.execute_script('return typeof(Nodeshot.body.currentView.panels.currentView.addressMarker)'), 'object')
        self.assertEqual(browser.execute_script('return Nodeshot.body.currentView.map.currentView.map.getZoom()'), 17)
        input.clear()
        # close panel
        self.browser.find_element_by_css_selector('#fn-search-address-mask').click()
        self.assertFalse(panel.is_displayed())
        sleep(1.55)
        self.assertEqual(browser.execute_script('return typeof(Nodeshot.body.currentView.panels.currentView.addressMarker)'), 'undefined')
        
        # layers control
        panel = browser.find_element_by_css_selector('#fn-map-layers')
        self.assertFalse(panel.is_displayed())
        browser.find_element_by_css_selector('#map-toolbar .icon-layer-2:not(.active)')
        browser.find_element_by_css_selector('#map-toolbar .icon-layer-2').click()
        browser.find_element_by_css_selector('#map-toolbar .icon-layer-2.active')
        self.assertEqual(len(browser.find_elements_by_css_selector('#fn-map-layers .switch-left')), 4)
        self.assertTrue(panel.is_displayed())
        # ensure it doesn't close after clicking on it
        panel.click()
        self.assertTrue(panel.is_displayed())
        # click somewhere else to close
        self.browser.find_element_by_css_selector('#fn-map-layers-mask').click()
        self.assertFalse(panel.is_displayed())
        # ensure it reopens correctly
        browser.find_element_by_css_selector('#map-toolbar .icon-layer-2:not(.active)')
        browser.find_element_by_css_selector('#map-toolbar .icon-layer-2').click()
        sleep(0.1)
        browser.find_element_by_css_selector('#map-toolbar .icon-layer-2.active')
        self.assertTrue(panel.is_displayed())
        
        # test map tools panel
        panel = browser.find_element_by_css_selector('#fn-map-tools')
        button = browser.find_element_by_css_selector('#map-toolbar .icon-tools')
        tool = browser.find_element_by_css_selector('#fn-map-tools .icon-select-area')
        self.assertFalse(panel.is_displayed())
        button.click()
        self.assertTrue(panel.is_displayed())
        # close panel
        self.browser.find_element_by_css_selector('#fn-map-tools-mask').click()
        self.assertFalse(panel.is_displayed())
        
        # test toolbar hide/show on mobile
        toolbar = browser.find_element_by_css_selector('#map-toolbar')
        button = browser.find_element_by_css_selector('#toggle-toolbar')
        self.assertTrue(toolbar.is_displayed())
        self.assertFalse(button.is_displayed())
        # make window narrower
        window_size = browser.get_window_size()
        browser.set_window_size(400, window_size['height'])
        # ensure toolbar hidden and button shown
        self.assertFalse(toolbar.is_displayed())
        self.assertTrue(button.is_displayed())
        # show toolbar
        button.click()
        self.assertTrue(toolbar.is_displayed())
        self.assertTrue(button.is_displayed())
        # hide again
        button.click()
        self.assertFalse(toolbar.is_displayed())
        self.assertTrue(button.is_displayed())
        # reset window size to original size
        browser.set_window_size(window_size['width'], window_size['height'])
        # ensure toolbar is visible
        self.assertTrue(toolbar.is_displayed())

    def test_map_legend(self):
        self._hashchange('#/map')
        browser = self.browser
        
        # ensure legend is open
        button = browser.find_element_by_css_selector('#btn-legend.disabled')
        legend = browser.find_element_by_css_selector('#map-legend')
        self.assertTrue(legend.is_displayed())
        
        # ensure legend item can be disabled
        browser.find_element_by_css_selector('#map-legend a').click()
        self.assertIn('disabled', browser.find_element_by_css_selector('#map-legend li').get_attribute('class'))
        # ensure it can be re-enabled
        browser.find_element_by_css_selector('#map-legend a').click()
        self.assertNotIn('disabled', browser.find_element_by_css_selector('#map-legend li').get_attribute('class'))
        
        # ensure it can be closed
        browser.find_element_by_css_selector('#map-legend .icon-close').click()
        sleep(0.3)
        self.assertFalse(legend.is_displayed())
        self.assertNotIn('disabled', button.get_attribute('class'))
        
        # reopen again
        button.click()
        sleep(0.3)
        self.assertIn('disabled', button.get_attribute('class'))
        self.assertTrue(legend.is_displayed())
        
        # ensure preference is mantained when switching pages back and forth
        button.click()
        sleep(0.3)
        self.assertFalse(legend.is_displayed())
        self._hashchange('#/')
        self._hashchange('#/map')
        legend = browser.find_element_by_css_selector('#map-legend')
        self.assertFalse(legend.is_displayed())

    def test_node_list(self):
        self.browser.find_element_by_css_selector('a[href="#/nodes"]').click()
        WebDriverWait(self.browser, 5).until(ajax_complete, 'Node list timeout')
        self.assertTrue(self.browser.execute_script("return Nodeshot.body.currentView.$el.attr('id') == 'node-list'"))

        for node in Node.objects.access_level_up_to('public'):
            self.assertIn(node.name, self.browser.page_source)

    def test_node_details(self):
        self._hashchange('#/nodes/pomezia')
        self.assertTrue(self.browser.execute_script("return Nodeshot.body.currentView.$el.attr('id') == 'map-container'"))
        self.browser.find_element_by_css_selector('#node-details')
        self.assertIn('Pomezia', self.browser.page_source)

    def test_user_profile(self):
        self._hashchange('#/users/romano')
        self.assertTrue(self.browser.execute_script("return Nodeshot.body.currentView.$el.attr('id') == 'user-details-container'"))
        self.assertIn('romano', self.browser.page_source)

    def test_login_and_logout(self):
        # open sign in modal
        self.browser.find_element_by_css_selector('#main-actions a[data-target="#signin-modal"]').click()
        sleep(0.5)
        # insert credentials
        username = self.browser.find_element_by_css_selector('#js-signin-form input[name=username]')
        username.clear()
        username.send_keys('admin')
        password = self.browser.find_element_by_css_selector('#js-signin-form input[name=password]')
        password.clear()
        password.send_keys('tester')
        # log in
        self.browser.find_element_by_css_selector('#js-signin-form button.btn-default').click()
        WebDriverWait(self.browser, 5).until(ajax_complete, 'Login timeout')
        # check username
        self.assertEqual(self.browser.find_element_by_css_selector('#js-username').text, 'admin')
        # open account menu
        self.browser.find_element_by_css_selector('#js-username').click()
        # log out
        self.browser.find_element_by_css_selector('#js-logout').click()
        WebDriverWait(self.browser, 5).until(ajax_complete, 'Logout timeout')
        # ensure UI has gone back to initial state
        self.browser.find_element_by_css_selector('#main-actions a[data-target="#signin-modal"]')

    def test_general_search(self):
        self._hashchange('#')
        search = self.browser.find_element_by_css_selector('#general-search-input')
        search.send_keys('RD')
        search.send_keys(Keys.ENTER)
        WebDriverWait(self.browser, 5).until(ajax_complete, 'Search timeout')
        results = self.browser.find_elements_by_css_selector('#js-search-results li')
        self.assertEqual(len(results), 4)
        search = self.browser.find_element_by_css_selector('#general-search-input')
        search.clear()
        search.send_keys('RDP')
        search.send_keys(Keys.ENTER)
        WebDriverWait(self.browser, 5).until(ajax_complete, 'Go to search result timeout')
        results = self.browser.find_elements_by_css_selector('#js-search-results li')
        self.assertEqual(len(results), 1)
        self.browser.find_element_by_css_selector('#js-search-results li a').click()
        WebDriverWait(self.browser, 5).until(ajax_complete, 'Go to search result timeout')
        self.assertIn('RDP', self.browser.find_element_by_css_selector('#node-details h2').text)

    def test_notifications(self):
        # open sign in modal
        self.browser.find_element_by_css_selector('#main-actions a[data-target="#signin-modal"]').click()
        sleep(0.5)
        # insert credentials
        username = self.browser.find_element_by_css_selector('#js-signin-form input[name=username]')
        username.clear()
        username.send_keys('admin')
        password = self.browser.find_element_by_css_selector('#js-signin-form input[name=password]')
        password.clear()
        password.send_keys('tester')
        # log in
        self.browser.find_element_by_css_selector('#js-signin-form button.btn-default').click()
        WebDriverWait(self.browser, 5).until(ajax_complete, 'Login timeout')

        # open notifications
        self.browser.find_element_by_css_selector('#main-actions a.notifications').click()
        self.browser.find_element_by_css_selector('#js-notifications-container .empty')
        self.browser.find_element_by_css_selector('#main-actions a.notifications').click()

        # open account menu
        self.browser.find_element_by_css_selector('#js-username').click()
        # log out
        self.browser.find_element_by_css_selector('#js-logout').click()
        WebDriverWait(self.browser, 5).until(ajax_complete, 'Logout timeout')
        # ensure UI has gone back to initial state
        self.browser.find_element_by_css_selector('#main-actions a[data-target="#signin-modal"]')

    def test_add_node(self):
        # open sign in modal
        self.browser.find_element_by_css_selector('#main-actions a[data-target="#signin-modal"]').click()
        sleep(0.5)  # animation
        # insert credentials
        username = self.browser.find_element_by_css_selector('#js-signin-form input[name=username]')
        username.clear()
        username.send_keys('admin')
        password = self.browser.find_element_by_css_selector('#js-signin-form input[name=password]')
        password.clear()
        password.send_keys('tester')
        # log in
        self.browser.find_element_by_css_selector('#js-signin-form button.btn-default').click()
        WebDriverWait(self.browser, 5).until(ajax_complete, 'Login timeout')

        # click on add node button
        self._hashchange('#/map')
        sleep(0.5)  # animation
        a = self.browser.find_element_by_css_selector('#map-toolbar a.icon-pin-add')
        a.click()
        self.browser.find_element_by_css_selector('#add-node-step1 .btn-default').click()
        a.click()
        self.browser.execute_script('Nodeshot.body.currentView.map.setView([41.86741963140808, 12.507655620574951], 18)')
        self.browser.find_element_by_css_selector('#add-node-step1')
        map_element = self.browser.find_element_by_css_selector('#map-js')
        actions = ActionChains(self.browser)
        actions.move_to_element_with_offset(map_element, 50, 50)
        map_element.click()
        # confirm
        self.browser.find_element_by_css_selector('#add-node-step2 .btn-success').click()
        sleep(0.5)  # animation
        # add node form
        self.assertTrue(self.browser.find_element_by_css_selector('#add-node-container').is_displayed())
        self.browser.find_element_by_css_selector('#add-node-container .btn-success').click()
        WebDriverWait(self.browser, 5).until(ajax_complete, 'Login timeout')
        self.assertNotEqual(self.browser.find_element_by_css_selector('#add-node-container .error-msg').text, '')
        self.browser.find_element_by_css_selector('#add-node-container .btn-default').click()
        sleep(0.5)  # animation
        self.assertFalse(self.browser.find_element_by_css_selector('#add-node-container').is_displayed())

        # open account menu
        self.browser.find_element_by_css_selector('#js-username').click()
        # log out
        self.browser.find_element_by_css_selector('#js-logout').click()
        WebDriverWait(self.browser, 5).until(ajax_complete, 'Logout timeout')
        # ensure UI has gone back to initial state
        self.browser.find_element_by_css_selector('#main-actions a[data-target="#signin-modal"]')
